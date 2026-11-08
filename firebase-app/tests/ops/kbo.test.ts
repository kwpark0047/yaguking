import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fixtureAdapter, importReviewSet, runKboPipeline, runKboStats } from '../../ops/kbo.mjs';
import { finalGame } from '../fixtures/kboGames';

/** 어제의 KBO 퀴즈 운영 작업 — 에뮬레이터 + 테스트 데이터. 실제 수집은 없다 */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const DATE = '2026-05-10';
const SET = '2026-05-11';
const NOW = Date.parse('2026-05-11T00:05:00+09:00');

describe.skipIf(!emulated)('어제의 KBO 퀴즈 운영 작업', () => {
  let app: App;
  let db: Firestore;
  let auth: Auth;

  beforeAll(() => {
    app = initializeApp({ projectId: 'demo-yaguking' }, 'kbo-test');
    db = getFirestore(app);
    auth = getAuth(app);
  });
  beforeEach(async () => {
    await db.recursiveDelete(db.collection('kboSets'));
    await db.recursiveDelete(db.collection('kboGames'));
    await db.doc('adminConfig/kboRuns').delete();
    await db.doc('adminConfig/kboQuiz').delete();
  });
  afterAll(async () => {
    await deleteApp(app);
  });

  const run = (day: unknown, gamesDate = DATE) => runKboPipeline({ db, adapter: fixtureAdapter({ [gamesDate]: day }), gamesDate, now: NOW });

  it('끝난 경기: 초안을 만들고 테스트 표시를 붙이며, 공개 문항에 정답이 없다', async () => {
    const report = await run({ games: [finalGame()] });
    expect(report).toMatchObject({ status: 'ok', games: 1, usable: 1, questions: 5, setId: SET });
    const set = await db.doc(`kboSets/${SET}`).get();
    expect(set.get('state')).toBe('draft');
    expect(set.get('isTest')).toBe(true);
    expect(set.get('kind')).toBe('quiz');
    expect(set.get('publishAt').toMillis()).toBe(Date.parse(`${SET}T06:00:00+09:00`));
    expect(JSON.stringify(set.get('questions'))).not.toMatch(/correct|explanation/);
    expect((await db.collection(`kboSets/${SET}/keys`).get()).size).toBe(5);
    expect((await db.doc(`kboGames/${finalGame().gameId}`).get()).get('usable')).toBe(true);
  });

  it('다시 돌려도 겹치지 않고 같은 문항이다', async () => {
    await run({ games: [finalGame()] });
    const first = (await db.doc(`kboSets/${SET}`).get()).get('questions');
    await run({ games: [finalGame(), finalGame()] });
    expect((await db.doc(`kboSets/${SET}`).get()).get('questions')).toEqual(first);
    expect((await db.collection('kboGames').get()).size).toBe(1);
  });

  it('경기 없음·우천 취소·시즌 끝', async () => {
    expect((await run({ games: [] })).status).toBe('no-game');
    expect((await db.doc(`kboSets/${SET}`).get()).get('kind')).toBe('no-game');
    await db.recursiveDelete(db.collection('kboSets'));
    expect((await run({ games: [finalGame({ status: 'cancelled' })] })).status).toBe('rainout');
    await db.recursiveDelete(db.collection('kboSets'));
    expect((await run({ seasonEnded: true, games: [] })).status).toBe('season-end');
    expect((await db.doc(`kboSets/${SET}`).get()).get('isTest')).toBe(true);
  });

  it('우천 취소가 섞이면 끝난 경기로만 낸다', async () => {
    const report = await run({ games: [finalGame(), finalGame({ gameId: 'TEST-RAIN', status: 'cancelled', home: { team: 'KT', runs: 0, innings: [] }, away: { team: 'NC', runs: 0, innings: [] } })] });
    expect(report).toMatchObject({ status: 'ok', games: 2, usable: 1 });
    const keys = await db.collection(`kboSets/${SET}/keys`).get();
    for (const key of keys.docs) expect(key.get('gameIds')).toEqual([finalGame().gameId]);
  });

  it('받기 실패: 이전 묶음을 그대로 두고 기록만 남긴다', async () => {
    await run({ games: [finalGame()] });
    const before = (await db.doc(`kboSets/${SET}`).get()).get('questions');
    const report = await run('fail');
    expect(report.status).toBe('fetch-failed');
    expect((await db.doc(`kboSets/${SET}`).get()).get('questions')).toEqual(before);
    const runs = (await db.doc('adminConfig/kboRuns').get()).get('runs');
    expect(runs[0].status).toBe('fetch-failed');
    expect(runs).toHaveLength(2);
  });

  it('검증 실패·확정 전: 문항을 만들지 않는다', async () => {
    const wrong = await run({ games: [finalGame({ winningPitcher: '곽빈' })] });
    expect(wrong.status).toBe('no-usable-games');
    expect(wrong.problems.join()).toMatch(/승리투수/);
    expect((await db.doc(`kboSets/${SET}`).get()).exists).toBe(false);
    const pending = await run({ games: [finalGame({ status: 'provisional' })] });
    expect(pending.status).toBe('waiting-final');
    expect((await db.doc(`kboSets/${SET}`).get()).exists).toBe(false);
  });

  it('다른 날 경기가 와도 쓰지 않는다', async () => {
    const report = await run({ games: [finalGame({ date: '2026-05-09' })] });
    expect(report.status).toBe('no-usable-games');
    expect((await db.doc(`kboSets/${SET}`).get()).exists).toBe(false);
  });

  it('승인된 묶음은 덮어쓰지 않고, 기록이 정정되면 그 경기를 쓴 문항을 철회한다', async () => {
    await run({ games: [finalGame()] });
    await db.doc(`kboSets/${SET}`).update({ state: 'approved' });
    const before = (await db.doc(`kboSets/${SET}`).get()).get('questions');
    expect((await run({ games: [finalGame()] })).status).toBe('already-approved');
    const report = await run({ games: [finalGame({ savePitcher: '' })] });
    expect(report).toMatchObject({ status: 'corrected', corrected: 1 });
    const after = await db.doc(`kboSets/${SET}`).get();
    expect(after.get('questions')).toEqual(before);
    expect(after.get('withdrawn')).toEqual([0, 1, 2, 3, 4]);
    expect(after.get('state')).toBe('approved');
  });

  it('초안일 때 정정되면 새 기록으로 다시 만든다', async () => {
    await run({ games: [finalGame()] });
    const report = await run({ games: [finalGame({ savePitcher: '' })] });
    expect(report).toMatchObject({ status: 'ok', corrected: 1 });
    expect((await db.doc(`kboGames/${finalGame().gameId}`).get()).get('savePitcher')).toBe('');
  });

  it('관리자가 정한 문제 수를 쓴다', async () => {
    await db.doc('adminConfig/kboQuiz').set({ questionCount: 3 });
    expect((await run({ games: [finalGame()] })).questions).toBe(3);
  });

  it('집계: 닫힌 묶음을 숫자로 남기고, 가입 완료를 세고, 보관 기간 지난 답을 지운다', async () => {
    const created = await auth.createUser({ email: `kbo-${Date.now()}@example.test`, password: 'kbo-test-123' });
    const anon = await auth.createUser({});
    await db.doc('kboSets/2026-05-09').set({ kind: 'quiz', questions: [{ stem: 'a' }, { stem: 'b' }], withdrawn: [1], state: 'approved', isTest: false, publishAt: Timestamp.now() });
    await db.doc('kboSets/2026-05-09/keys/0').set({ correct: 'A' });
    await db.doc('kboSets/2026-05-09/keys/1').set({ correct: 'B' });
    const at = FieldValue.serverTimestamp();
    await db.doc(`kboSets/2026-05-09/attempts/${created.uid}`).set({ guest: true, total: 2, viewedAt: at, signupClickedAt: at, answers: { 0: { choice: 'A', at }, 1: { choice: 'B', at } } });
    await db.doc(`kboSets/2026-05-09/attempts/${anon.uid}`).set({ guest: true, total: 2, viewedAt: at, answers: { 0: { choice: 'B', at } } });
    await db.doc(`kboSets/2026-05-08/attempts/${anon.uid}`).set({ guest: true, total: 2, viewedAt: at, answers: {} });
    await db.doc('kboSets/2026-04-08/attempts/old').set({ guest: true, total: 2, viewedAt: at, answers: {} });
    await db.doc('kboSets/2026-04-20/attempts/kept').set({ guest: true, total: 2, viewedAt: at, answers: {} });

    const report = await runKboStats({ db, auth, now: NOW });
    expect(report).toMatchObject({ setId: '2026-05-09', counted: true, views: 2, attemptsDeleted: 1 });
    const summary = await db.doc('kboSets/2026-05-09/stats/summary').get();
    expect(summary.data()).toMatchObject({ views: 2, guestViews: 2, starts: 2, completes: 1, signupClicks: 1, signupCompletes: 1, returned: 1 });
    expect(summary.get('questions')[0]).toEqual({ index: 0, answered: 2, correct: 1 });
    expect(summary.get('questions')[1]).toEqual({ index: 1, answered: 0, correct: 0 });
    expect(JSON.stringify(summary.data())).not.toContain(created.uid);
    expect((await db.doc('kboSets/2026-04-08/attempts/old').get()).exists).toBe(false);
    expect((await db.doc('kboSets/2026-04-20/attempts/kept').get()).exists).toBe(true);
    await auth.deleteUser(created.uid);
    await auth.deleteUser(anon.uid);
  });
  it('돌아보기 묶음 올리기: 초안으로, 정답은 정답 문서에만, 승인된 묶음은 덮어쓰지 않는다', async () => {
    const question = (index: number) => ({
      stem: `돌아보기 테스트 ${index}`,
      options: ['A', 'B', 'C', 'D'].map((label) => ({ label, text: `${index}${label}` })),
      difficulty: 'easy',
      category: 'team-history',
      recordAsOf: '2026-11-08',
      seasonScope: '2026 시즌',
      correct: 'C',
      explanation: '해설',
      source: '테스트 출처 https://example.test/source',
    });
    const result = await importReviewSet({ db, setId: '2026-11-20', questions: [question(0), question(1)] });
    expect(result).toMatchObject({ written: true, questions: 2 });
    const set = await db.doc('kboSets/2026-11-20').get();
    expect(set.data()).toMatchObject({ kind: 'review', state: 'draft', isTest: false, withdrawn: [] });
    expect(set.get('publishAt').toMillis()).toBe(Date.parse('2026-11-20T06:00:00+09:00'));
    expect(JSON.stringify(set.get('questions'))).not.toMatch(/correct|explanation|example.test/);
    expect((await db.doc('kboSets/2026-11-20/keys/1').get()).data()).toMatchObject({ correct: 'C', sourceName: '테스트 출처', sourceUrl: 'https://example.test/source' });
    await db.doc('kboSets/2026-11-20').update({ state: 'approved' });
    expect(await importReviewSet({ db, setId: '2026-11-20', questions: [question(9)] })).toMatchObject({ written: false });
    expect((await db.doc('kboSets/2026-11-20').get()).get('questions')).toHaveLength(2);
    // --replace: 공개 전 승인 묶음은 바꾸고 다시 초안으로, 공개 시각이 지난 묶음은 그대로
    const replaced = await importReviewSet({ db, setId: '2026-11-20', questions: [question(9)], replace: true, now: Date.parse('2026-11-19T12:00:00+09:00') });
    expect(replaced).toMatchObject({ written: true, replaced: 'review/approved' });
    expect((await db.doc('kboSets/2026-11-20').get()).get('state')).toBe('draft');
    expect((await db.doc('kboSets/2026-11-20/keys/1').get()).exists).toBe(false);
    await db.doc('kboSets/2026-11-20').update({ state: 'approved' });
    expect(await importReviewSet({ db, setId: '2026-11-20', questions: [question(8)], replace: true, now: Date.parse('2026-11-20T07:00:00+09:00') })).toMatchObject({ written: false });
  });
});
