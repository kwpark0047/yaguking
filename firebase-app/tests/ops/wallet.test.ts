import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HINT_START, WELCOME_BONUS_POINTS, WELCOME_BONUS_START, runWallets } from '../../ops/monthly.mjs';

/** 힌트 지갑(ops/monthly.mjs runWallets) — Firestore 에뮬레이터에서 실제로. `npm run test:ops` */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJECT = 'demo-yaguking';
const START = '2026-11-05';
/** 한국 시간 그날 0시 1분(운영자 PC 예약 작업 시각) */
const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 0, 1) - 9 * 3_600_000;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe.skipIf(!emulated)('힌트 지갑(에뮬레이터)', () => {
  let app: App;
  let db: Firestore;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, 'wallet-test');
    db = getFirestore(app);
  });
  afterAll(async () => {
    await deleteApp(app);
  });
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  });

  async function memberWith(uid: string, days: Record<string, number[]>) {
    await db.doc(`users/${uid}`).set({ ageConfirmedAt: new Date(), nickname: uid, favoriteTeams: ['lg'] });
    for (const [month, list] of Object.entries(days)) await db.doc(`users/${uid}/attendance/${month}`).set({ days: list, updatedAt: new Date() });
  }
  const wallet = (uid: string) => db.doc(`users/${uid}/wallet/main`).get();
  // 가입 축하 포인트는 아래 테스트에서만 켠다(다른 테스트의 숫자를 흔들지 않게)
  const run = (now: number, welcomeStart = '2099-01-01') => runWallets({ db, now, start: START, hintStart: '2026-11-11', welcomeStart });

  it('시작일(처리방침 판) 전에는 아무것도 쓰지 않는다', async () => {
    await memberWith('alice', { '202611': [5, 6, 7] });
    expect(HINT_START).toBe('2026-11-12');
    expect(await run(at(2026, 11, 10))).toEqual({ started: false, members: 0, updated: 0 });
    expect((await wallet('alice')).exists).toBe(false);
  });

  it('시작일에 지난 출석을 한꺼번에 센다 — 어제까지, 시작 전 날짜·오늘 도장은 빼고, 출석 없는 회원은 문서를 안 만든다', async () => {
    await memberWith('alice', { '202611': [1, 4, 5, 6, 7, 10, 11] }); // 5·6·7·10 = 4일(11일은 오늘)
    await memberWith('bob', {});
    await db.doc('users/alice/officialMonth/202611').set({ days: { '20261106': 150 } }); // 공식 점수는 넣지 않는다
    expect(await run(at(2026, 11, 11))).toEqual({ started: true, members: 2, updated: 1 });
    expect((await wallet('alice')).data()).toMatchObject({ earned: 40, spent: 0, earnedThrough: '2026-11-10' });
    expect((await wallet('bob')).exists).toBe(false);
  });

  it('달을 넘어 누적한다 — 7일 연속 +30, 개근 +100, 2배 날', async () => {
    await db.doc('adminConfig/events').set({ doubleDays: ['2026-11-06'] });
    await memberWith('alice', { '202611': range(5, 30), '202612': [1, 2] });
    await run(at(2026, 12, 3));
    // 11월 26일 + 2배 하루 = 270, 7일 연속 3번 = 90, 개근 100 → 460. 12월 2일 = 20
    expect((await wallet('alice')).get('earned')).toBe(480);
  });

  it('쓴 포인트는 건드리지 않고, 바뀐 사람만 쓴다', async () => {
    await memberWith('alice', { '202611': [5, 6] });
    await memberWith('bob', { '202611': [5] });
    expect((await run(at(2026, 11, 11))).updated).toBe(2);
    await db.doc('users/alice/wallet/main').update({ spent: 20 });

    const before = (await wallet('bob')).updateTime;
    await db.doc('users/alice/attendance/202611').set({ days: [5, 6, 11], updatedAt: new Date() });
    expect(await run(at(2026, 11, 12))).toEqual({ started: true, members: 2, updated: 1 });
    expect((await wallet('alice')).data()).toMatchObject({ earned: 30, spent: 20, earnedThrough: '2026-11-11' });
    expect((await wallet('bob')).updateTime).toEqual(before);
  });

  it('달 초하루에는 이번 달 몫이 없다(어제까지), 지난달은 다 센다', async () => {
    await memberWith('alice', { '202611': [5], '202612': [1] });
    await run(at(2026, 12, 1));
    expect((await wallet('alice')).get('earned')).toBe(10);
  });

  it('가입 축하: 시작일부터 닉네임까지 마친 회원 모두에게 50P를 한 번 — 다시 돌려도 두 번 들어가지 않는다', async () => {
    expect(WELCOME_BONUS_POINTS).toBe(50);
    await memberWith('alice', { '202611': [5] });
    await memberWith('bob', {});
    await db.doc('users/nonick').set({ ageConfirmedAt: new Date() });
    await run(at(2026, 11, 19), '2026-11-20');
    expect((await wallet('alice')).get('earned')).toBe(10);
    expect((await wallet('bob')).exists).toBe(false);
    await run(at(2026, 11, 20), '2026-11-20');
    await run(at(2026, 11, 20), '2026-11-20');
    expect((await wallet('alice')).get('earned')).toBe(60);
    expect((await wallet('bob')).get('earned')).toBe(50);
    expect((await wallet('bob')).get('spent')).toBe(0);
    expect((await wallet('nonick')).exists).toBe(false);
    expect(WELCOME_BONUS_START).toBe('2026-11-20');
  });
});
