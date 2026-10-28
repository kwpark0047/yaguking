import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HIDDEN_NAME, REMOVED_NAME, runMonthly } from '../../ops/monthly.mjs';

/** 월간 등수(ops/monthly.mjs) — Firestore 에뮬레이터에서 실제로. `npm run test:ops` */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJECT = 'demo-yaguking';
const START = '2026-11-05';
/** 한국 시간 그날 03:30(운영자 PC 예약 작업 시각) */
const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 3, 30) - 9 * 3_600_000;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe.skipIf(!emulated)('월간 등수(에뮬레이터)', () => {
  let app: App;
  let db: Firestore;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, 'monthly-test');
    db = getFirestore(app);
  });
  afterAll(async () => {
    await deleteApp(app);
  });
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  });

  async function memberWith(uid: string, nickname: string | null, days: Record<string, number[]>, extra: object = {}) {
    await db.doc(`users/${uid}`).set({ ageConfirmedAt: new Date(), ...(nickname ? { nickname, favoriteTeams: ['lg'] } : {}), ...extra });
    for (const [month, list] of Object.entries(days)) await db.doc(`users/${uid}/attendance/${month}`).set({ days: list, updatedAt: new Date() });
  }
  const board = async (month: string) => (await db.doc(`leaderboards/${month}`).get()).data()!;

  it('시작 전 달은 아무것도 쓰지 않는다', async () => {
    await memberWith('a', '에이스', { '202610': [1, 2] });
    expect(await runMonthly({ db, now: at(2026, 10, 29), start: START })).toMatchObject({ participants: 0, finalized: null });
    expect((await db.collection('leaderboards').get()).size).toBe(0);
  });

  it('이번 달은 어제까지, 숨긴 회원은 익명, 닉네임 없는 회원·0점은 빠짐, uid는 따로', async () => {
    await memberWith('a', '에이스', { '202612': [1, 2, 3, 4, 5] });
    await memberWith('b', '불펜', { '202612': [1, 2, 3, 4, 5] }, { rankingHidden: true });
    await memberWith('c', '클로저', { '202612': [5] }); // 오늘(5일) 찍은 것 — 내일 반영
    await memberWith('d', null, { '202612': [1, 2] });
    const report = await runMonthly({ db, now: at(2026, 12, 5), start: '2026-12-01' });
    expect(report).toMatchObject({ month: '202612', participants: 2 });
    const current = await board('202612');
    expect(current).toMatchObject({ through: 4, final: false, participants: 2, histogram: { '40': 2 } });
    expect(current.top.map((entry: { nickname: string; rank: number; team: string | null }) => [entry.nickname, entry.rank, entry.team])).toEqual([
      [HIDDEN_NAME, 1, null],
      ['에이스', 1, 'lg'],
    ]);
    expect(JSON.stringify(current)).not.toContain('"a"'); // uid는 공개 문서에 없다
    expect((await db.doc('leaderboardKeys/202612').get()).get('uids')).toHaveLength(2);
  });

  it('다음 달 첫 실행이 지난달을 확정하고 칭호를 준다 — 확정된 달은 다시 계산하지 않는다, 이번 달에 지난달 칭호를 단다', async () => {
    await memberWith('a', '에이스', { '202611': range(5, 30), '202612': [1] });
    await memberWith('b', '불펜', { '202611': range(5, 20) });
    await memberWith('c', '클로저', { '202611': [10] });
    const report = await runMonthly({ db, now: at(2026, 12, 2), start: START });
    expect(report).toMatchObject({ finalized: '202611', awards: 3 });
    const last = await board('202611');
    expect(last).toMatchObject({ final: true, through: 30, participants: 3 });
    expect(last.top[0]).toMatchObject({ nickname: '에이스', rank: 1, days: 26, titles: ['king', 'perfect'] });
    expect(last.top[1].titles).toEqual(['allstar']);
    expect((await db.doc('users/a/awards/202611').get()).data()).toMatchObject({ rank: 1, titles: ['king', 'perfect'] });
    expect((await board('202612')).top[0]).toMatchObject({ nickname: '에이스', titles: ['king', 'perfect'] });

    // 확정 뒤 출석 문서가 바뀌어도(있을 수 없지만) 지난달 등수는 그대로
    await db.doc('users/c/attendance/202611').set({ days: range(1, 30), updatedAt: new Date() });
    expect((await runMonthly({ db, now: at(2026, 12, 3), start: START })).finalized).toBeNull();
    expect((await board('202611')).top[2]).toMatchObject({ nickname: '클로저', days: 1 });
  });

  it('탈퇴한 회원은 확정된 달에서도 지우고, 12달이 지난 등수는 지운다', async () => {
    await memberWith('a', '에이스', { '202611': [10, 11] });
    await memberWith('b', '불펜', { '202611': [10] });
    await runMonthly({ db, now: at(2026, 12, 2), start: START });
    await db.recursiveDelete(db.doc('users/a')); // 탈퇴
    expect((await runMonthly({ db, now: at(2026, 12, 3), start: START })).scrubbed).toBe(1);
    const last = await board('202611');
    expect(last.top[0]).toMatchObject({ nickname: REMOVED_NAME, team: null, titles: [] });
    expect(last.top[1].nickname).toBe('불펜');

    expect((await runMonthly({ db, now: at(2027, 12, 2), start: START })).removed).toBe(1);
    expect((await db.doc('leaderboards/202611').get()).exists).toBe(false);
  });
});
