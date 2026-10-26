import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GUEST_RETENTION_DAYS, cleanup, isAnonymous, lastActiveMs } from '../../ops/cleanup.mjs';

/**
 * 8단계 정리 작업 — Auth·Firestore 에뮬레이터에서 관리자 권한으로 실제로 지워 본다.
 * `npm run test:ops`(에뮬레이터를 띄운다). 에뮬레이터가 없으면 건너뛴다.
 */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const PROJECT = 'demo-yaguking';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('계정 구분·마지막 이용', () => {
  it('로그인 수단이 없으면 비회원(익명)', () => {
    expect(isAnonymous({ providerData: [] })).toBe(true);
    expect(isAnonymous({ providerData: [{ providerId: 'password' }], email: 'a@b.c' })).toBe(false);
    expect(isAnonymous({ providerData: [{ providerId: 'google.com' }] })).toBe(false);
  });

  it('만든 때·로그인·토큰 갱신 중 가장 늦은 때', () => {
    const user = {
      metadata: {
        creationTime: 'Mon, 01 Jun 2026 00:00:00 GMT',
        lastSignInTime: 'Mon, 01 Jun 2026 00:00:00 GMT',
        lastRefreshTime: '2026-10-01T00:00:00.000Z',
      },
    };
    expect(lastActiveMs(user)).toBe(Date.parse('2026-10-01T00:00:00.000Z'));
  });
});

describe.skipIf(!emulated)('정리 작업(에뮬레이터)', () => {
  let app: App;
  let db: Firestore;
  let auth: Auth;
  let guestUid: string;
  let memberUid: string;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, 'cleanup-test');
    db = getFirestore(app);
    auth = getAuth(app);
  });
  afterAll(async () => {
    await deleteApp(app);
  });

  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
      method: 'DELETE',
    });
    await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, {
      method: 'DELETE',
    });

    const seat = { nickname: 'x', score: 0, answers: [] };
    await db.doc('rooms/OLD222').set({ status: 'finished', createdAt: Timestamp.fromMillis(Date.now() - 25 * HOUR) });
    await db.doc('rooms/OLD222/players/p1').set(seat);
    await db.doc('rooms/OLD222/players/p2').set(seat);
    await db.doc('rooms/NEW222').set({ status: 'waiting', createdAt: Timestamp.now() });
    await db.doc('rooms/NEW222/players/p1').set(seat);
    // 방장이 닫은 방 — 방 문서 없이 다른 사람 자리만 남았다
    await db.doc('rooms/GONE22/players/p3').set(seat);

    guestUid = (await auth.createUser({})).uid;
    for (const path of ['games/g1', 'summary/main', 'daily/20387', 'wrongNotes/q0123456789ab']) {
      await db.doc(`users/${guestUid}/${path}`).set({ x: 1 });
    }
    memberUid = (await auth.createUser({ email: 'member@example.test', password: 'yaguking-123' })).uid;
    await db.doc(`users/${memberUid}`).set({ nickname: '회원' });
    await db.doc(`users/${memberUid}/games/g1`).set({ x: 1 });
  });

  const exists = async (path: string) => (await db.doc(path).get()).exists;
  const userExists = async (uid: string) =>
    auth.getUser(uid).then(
      () => true,
      () => false,
    );

  it('미리 보기는 세기만 하고 아무것도 지우지 않는다', async () => {
    const report = await cleanup({ db, auth });
    expect(report).toMatchObject({ dryRun: true, rooms: 1, orphanSeats: 1, guests: 0, deletedDocs: 4 });
    expect(await exists('rooms/OLD222')).toBe(true);
    expect(await exists('rooms/GONE22/players/p3')).toBe(true);
  });

  it('24시간 지난 방과 그 자리, 주인 없는 자리를 지우고 새 방은 둔다', async () => {
    const report = await cleanup({ db, auth, dryRun: false });
    expect(report).toMatchObject({ rooms: 1, orphanSeats: 1, guests: 0 });
    expect(await exists('rooms/OLD222')).toBe(false);
    expect(await exists('rooms/OLD222/players/p1')).toBe(false);
    expect(await exists('rooms/GONE22/players/p3')).toBe(false);
    expect(await exists('rooms/NEW222')).toBe(true);
    expect(await exists('rooms/NEW222/players/p1')).toBe(true);
  });

  it(`${GUEST_RETENTION_DAYS}일 쓰지 않은 비회원은 계정과 기록을 모두 지우고, 회원은 그대로`, async () => {
    const later = Date.now() + (GUEST_RETENTION_DAYS + 1) * DAY;
    const report = await cleanup({ db, auth, now: later, dryRun: false });
    expect(report.guests).toBe(1);
    expect(await userExists(guestUid)).toBe(false);
    for (const path of ['games/g1', 'summary/main', 'daily/20387', 'wrongNotes/q0123456789ab']) {
      expect(await exists(`users/${guestUid}/${path}`)).toBe(false);
    }
    expect(await userExists(memberUid)).toBe(true);
    expect(await exists(`users/${memberUid}`)).toBe(true);
    expect(await exists(`users/${memberUid}/games/g1`)).toBe(true);
  });

  it('아직 기간 안의 비회원은 둔다', async () => {
    const report = await cleanup({ db, auth, now: Date.now() + (GUEST_RETENTION_DAYS - 1) * DAY, dryRun: false });
    expect(report.guests).toBe(0);
    expect(await userExists(guestUid)).toBe(true);
  });

  it('지울 문서 상한에 닿으면 멈추고 알린다(무료 삭제 한도)', async () => {
    const later = Date.now() + (GUEST_RETENTION_DAYS + 1) * DAY;
    const report = await cleanup({ db, auth, now: later, dryRun: false, maxDeletes: 2 });
    expect(report.stoppedAtLimit).toBe(true);
    expect(report.deletedDocs).toBeLessThan(10);
    // 상한 때문에 비회원까지 가지 못했다 → 계정이 남는다(기록만 지우고 계정을 지우는 일이 없다)
    expect(await userExists(guestUid)).toBe(true);
  });
});
