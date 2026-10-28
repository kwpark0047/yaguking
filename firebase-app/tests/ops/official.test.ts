import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMonthly } from '../../ops/monthly.mjs';
import { OFFICIAL_TOTAL, questionPoints, roundOpensAt, runOfficial } from '../../ops/official.mjs';

/** 오늘의 공식전(ops/official.mjs) — Firestore 에뮬레이터에서 실제로. `npm run test:ops` */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJECT = 'demo-yaguking';
const START = '2026-11-05';
const DAY = 86_400_000;
/** 한국 시간 그날 03:30 */
const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 3, 30) - 9 * 3_600_000;
const header =
  'category_slug,difficulty,record_as_of,era_year,season_scope,stem,explanation,option_a,option_b,option_c,option_d,correct_label,source_name,source_url,verified_at,rights_note';
const pool = (count: number) =>
  [header, ...Array.from({ length: count }, (_, i) => `rules,easy,2026-11-01,,,공식전 시험 문항 ${i},해설 ${i},가,나,다,라,A,운영자 작성,,2026-11-01,직접 씀`)].join('\n');

describe.skipIf(!emulated)('오늘의 공식전(에뮬레이터)', () => {
  let app: App;
  let db: Firestore;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, 'official-test');
    db = getFirestore(app);
  });
  afterAll(async () => {
    await deleteApp(app);
  });
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  });

  it('오늘·내일 공식전을 만든다 — 정답은 따로, 쓴 문항은 다시 안 쓰고, 모자라면 그날은 건너뛴다, 시작 전 날은 안 만든다', async () => {
    const first = await runOfficial({ db, poolText: pool(12), now: at(2026, 11, 5), start: START, bank: new Set() });
    expect(first).toMatchObject({ published: ['20261105', '20261106'], short: [], remaining: 2 });
    const round = (await db.doc('officialRounds/20261105').get()).data()!;
    expect(round.total).toBe(OFFICIAL_TOTAL);
    expect(round.opensAt.toMillis()).toBe(roundOpensAt('20261105'));
    const question = (await db.doc('officialRounds/20261105/questions/0').get()).data()!;
    expect(Object.keys(question).sort()).toEqual(['category', 'difficulty', 'options', 'recordAsOf', 'seasonScope', 'stem']); // 정답 없음
    expect((await db.doc('officialKeys/20261105').get()).get('answers')).toHaveLength(OFFICIAL_TOTAL);

    // 다음 날: 06일은 이미 있고, 07일은 문항이 2개뿐이라 못 만든다
    const second = await runOfficial({ db, poolText: pool(12), now: at(2026, 11, 6), start: START, bank: new Set() });
    expect(second).toMatchObject({ published: [], short: ['20261107'], remaining: 2 });
    expect((await db.doc('adminStats/official').get()).data()).toMatchObject({ remaining: 2, daysLeft: 0, short: ['20261107'] });

    expect((await runOfficial({ db, poolText: pool(12), now: at(2026, 11, 3), start: START, bank: new Set() })).published).toEqual([]);
  });

  it('닫힌 공식전을 채점해 회원의 그날 점수로 쓰고, 정답·해설을 공개한다 — 다시 돌려도 같다, 탈퇴한 회원의 답은 지운다', async () => {
    await runOfficial({ db, poolText: pool(10), now: at(2026, 11, 5), start: START, bank: new Set() });
    const key = (await db.doc('officialKeys/20261105').get()).get('answers') as string[];
    const opens = roundOpensAt('20261105') + 3_600_000;
    const answers = Object.fromEntries(
      key.map((label, index) => [String(index), { choice: index === 0 ? (label === 'A' ? 'B' : 'A') : label, at: Timestamp.fromMillis(opens + (index + 1) * 3_000) }]),
    );
    await db.doc('users/alice').set({ nickname: '에이스', favoriteTeams: ['lg'], ageConfirmedAt: new Date() });
    await db.doc('officialRounds/20261105/attempts/alice').set({ startedAt: Timestamp.fromMillis(opens), total: OFFICIAL_TOTAL, answers });
    await db.doc('officialRounds/20261105/attempts/ghost').set({ startedAt: Timestamp.fromMillis(opens), total: OFFICIAL_TOTAL, answers: {} });

    expect(await runOfficial({ db, now: at(2026, 11, 5) + 3_600_000, start: START, bank: new Set() })).toMatchObject({ graded: [] }); // 아직 열림
    const report = await runOfficial({ db, now: at(2026, 11, 6), start: START, bank: new Set() });
    expect(report).toMatchObject({ graded: ['20261105'], attempts: 1, removedAttempts: 1, remaining: null });
    const expected = 4 * questionPoints(true, 3_000) + 20; // 첫 문제 틀림, 나머지 3초씩, 완주
    expect((await db.doc('users/alice/officialMonth/202611').get()).get('days')).toEqual({ '20261105': expected });
    expect((await db.doc('officialRounds/20261105/attempts/ghost').get()).exists).toBe(false);
    const round = (await db.doc('officialRounds/20261105').get()).data()!;
    expect(round).toMatchObject({ participants: 1, revealed: { answers: key } });

    // 다시 돌려도 채점은 한 번(이미 채점된 공식전 — 06일은 이날 처음 채점)
    expect((await runOfficial({ db, now: at(2026, 11, 7), start: START, bank: new Set() })).graded).toEqual(['20261106']);
    expect((await db.doc('users/alice/officialMonth/202611').get()).get('days')).toEqual({ '20261105': expected });

    // 월간 등수 = 출석 + 공식 점수
    await db.doc('users/alice/attendance/202611').set({ days: [5], updatedAt: new Date() });
    await runMonthly({ db, now: at(2026, 11, 7), start: START });
    const top = (await db.doc('leaderboards/202611').get()).get('top');
    expect(top[0]).toMatchObject({ nickname: '에이스', points: 10 + expected, official: expected, rounds: 1, days: 1 });
  });

  it(`공식전 날부터 40일이 지나면 문제·답·정답을 지운다`, async () => {
    await runOfficial({ db, poolText: pool(10), now: at(2026, 11, 5), start: START, bank: new Set() });
    await db.doc('officialRounds/20261105/attempts/alice').set({ startedAt: Timestamp.now(), total: 5, answers: {} });
    const report = await runOfficial({ db, now: at(2026, 11, 5) + 41 * DAY, start: START, bank: new Set() });
    expect(report.deletedRounds).toBe(2);
    expect((await db.doc('officialRounds/20261105/attempts/alice').get()).exists).toBe(false);
    expect((await db.doc('officialKeys/20261105').get()).exists).toBe(false);
  });
});
