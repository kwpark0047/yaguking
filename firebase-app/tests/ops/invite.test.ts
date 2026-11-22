import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { revokeInvite, runInvites } from '../../ops/invite.mjs';
import { runWallets } from '../../ops/monthly.mjs';

/** 친구 초대 0시 작업(ops/invite.mjs) — Firestore 에뮬레이터에서 실제로. `npm run test:ops` */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJECT = 'demo-yaguking';
const KST = 9 * 3_600_000;
/** 한국 시간 그날 0시 1분(운영자 PC 예약 작업 시각) */
const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 0, 1) - KST;
/** 한국 시간 그날 낮 12시 */
const noon = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12) - KST;
const serial = (ms: number) => Math.trunc((ms + KST) / 86_400_000);

describe.skipIf(!emulated)('친구 초대 0시 작업(에뮬레이터)', () => {
  let app: App;
  let db: Firestore;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, 'invite-test');
    db = getFirestore(app);
  });
  afterAll(async () => {
    await deleteApp(app);
  });
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  });

  async function inviter(uid: string, code: string) {
    await db.doc(`users/${uid}`).set({ ageConfirmedAt: new Date(), createdAt: new Date(), nickname: uid, inviteCode: code });
    await db.doc(`invites/${code}`).set({ uid, createdAt: new Date() });
  }
  async function invitee(uid: string, code: string, linkedAt: number, playedOn: number[] = []) {
    await db.doc(`users/${uid}`).set({ ageConfirmedAt: new Date(linkedAt), createdAt: new Date(linkedAt), nickname: `${uid}닉`, invitedBy: code, invitedAt: new Date(linkedAt) });
    for (const ms of playedOn) await db.doc(`users/${uid}/daily/${serial(ms)}`).set({ count: 1 });
  }
  const ledger = async (uid: string) => (await db.doc(`inviteLedger/${uid}`).get()).data();
  const meta = async (uid: string) => (await db.doc(`users/${uid}/meta/invites`).get()).data();

  it('시작일 전에는 아무것도 하지 않는다', async () => {
    await inviter('alice', 'ALICE2');
    await invitee('bob', 'ALICE2', noon(2026, 11, 20), [noon(2026, 11, 20), noon(2026, 11, 21)]);
    expect((await runInvites({ db, now: at(2026, 11, 25) })).started).toBe(false);
    expect(await ledger('bob')).toBeUndefined();
  });

  it('연결 → 가입(확인 중) → 7일 안 2일 경기 → 보상(이벤트 2배) → 합계, 다시 돌려도 같다', async () => {
    await inviter('alice', 'ALICE2');
    await invitee('bob', 'ALICE2', noon(2026, 12, 2), [noon(2026, 12, 2)]);
    const first = await runInvites({ db, now: at(2026, 12, 3) });
    expect(first).toMatchObject({ started: true, linked: 1, created: 1, rewarded: 0 });
    expect(await ledger('bob')).toMatchObject({ inviter: 'alice', status: 'joined', nickname: 'bob닉', linkedDay: '2026-12-02' });

    await db.doc(`users/bob/daily/${serial(noon(2026, 12, 4))}`).set({ count: 2 });
    const second = await runInvites({ db, now: at(2026, 12, 5) });
    expect(second).toMatchObject({ rewarded: 1 });
    expect(await ledger('bob')).toMatchObject({ status: 'rewarded', activeDay: '2026-12-04', event: 'scout-week-2026', inviterPoints: 200, inviteePoints: 100 });
    expect(await meta('alice')).toMatchObject({ bonus: 200, rewarded: 1, titles: [] });
    expect(await meta('bob')).toMatchObject({ bonus: 100, rewarded: 0 });

    const again = await runInvites({ db, now: at(2026, 12, 6) });
    expect(again).toMatchObject({ rewarded: 0, summaries: 0 });
    expect(await meta('alice')).toMatchObject({ bonus: 200 });
  });

  it('오늘 경기는 아직 세지 않고, 7일이 지나면 기간 지남, 이벤트 밖이면 1배', async () => {
    await inviter('alice', 'ALICE2');
    await invitee('bob', 'ALICE2', noon(2026, 12, 20), [noon(2026, 12, 20), noon(2026, 12, 21)]);
    await invitee('carol', 'ALICE2', noon(2026, 12, 20), [noon(2026, 12, 20)]);
    await runInvites({ db, now: noon(2026, 12, 21) }); // 21일 경기는 오늘이라 아직
    expect(await ledger('bob')).toMatchObject({ status: 'joined' });
    await runInvites({ db, now: at(2026, 12, 22) });
    expect(await ledger('bob')).toMatchObject({ status: 'rewarded', inviterPoints: 100, inviteePoints: 50, event: null });
    await runInvites({ db, now: at(2026, 12, 26) });
    expect(await ledger('carol')).toMatchObject({ status: 'joined' }); // 20~26일이 기간 — 26일은 아직 진행 중
    await runInvites({ db, now: at(2026, 12, 27) });
    expect(await ledger('carol')).toMatchObject({ status: 'expired' });
  });

  it('한 달 10명까지 — 넘으면 초대한 사람은 0P(받은 사람은 그대로), 3명·10명 칭호와 보너스', async () => {
    await inviter('alice', 'ALICE2');
    for (let i = 0; i < 11; i += 1) await invitee(`f${String(i).padStart(2, '0')}`, 'ALICE2', noon(2026, 12, 20), [noon(2026, 12, 20), noon(2026, 12, 21)]);
    const report = await runInvites({ db, now: at(2026, 12, 22) });
    expect(report).toMatchObject({ rewarded: 11, capped: 1 });
    expect(await meta('alice')).toMatchObject({ rewarded: 10, titles: ['scout', 'gm'], bonus: 10 * 100 + 100 + 300 });
    expect(await meta('f10')).toMatchObject({ bonus: 50 });
  });

  it('지갑 작업이 보너스를 힌트 포인트에 더한다(출석 포인트와 따로)', async () => {
    await inviter('alice', 'ALICE2');
    await invitee('bob', 'ALICE2', noon(2026, 12, 20), [noon(2026, 12, 20), noon(2026, 12, 21)]);
    await runInvites({ db, now: at(2026, 12, 22) });
    await runWallets({ db, now: at(2026, 12, 22), welcomeStart: '2099-01-01' });
    expect((await db.doc('users/alice/wallet/main').get()).data()).toMatchObject({ earned: 100, spent: 0 });
    expect((await db.doc('users/bob/wallet/main').get()).data()).toMatchObject({ earned: 50 });
  });

  it('운영자가 취소하면 다음 실행에서 합계가 빠지고, 탈퇴한 회원의 기록은 지운다', async () => {
    await inviter('alice', 'ALICE2');
    await invitee('bob', 'ALICE2', noon(2026, 12, 20), [noon(2026, 12, 20), noon(2026, 12, 21)]);
    await invitee('carol', 'ALICE2', noon(2026, 12, 20), [noon(2026, 12, 20), noon(2026, 12, 21)]);
    await runInvites({ db, now: at(2026, 12, 22) });
    expect(await revokeInvite({ db, inviteeUid: 'bob' })).toEqual({ revoked: true });
    await db.doc('users/carol').delete(); // 탈퇴
    const report = await runInvites({ db, now: at(2026, 12, 23) });
    expect(report.removed).toBe(1);
    expect(await ledger('carol')).toBeUndefined();
    expect(await ledger('bob')).toMatchObject({ status: 'revoked', inviterPoints: 0 });
    expect(await meta('alice')).toMatchObject({ bonus: 0, rewarded: 0 });
    expect((await db.collection('adminLogs').where('action', '==', 'invite.revoke').get()).size).toBe(1);
  });
});
