import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulatorHost, guest, member, seedConfirmedMember, startRulesEnv } from './setup';

/** 어제의 KBO 퀴즈 규칙 — 정답은 답을 낸 본인에게만, 공개 시각·승인·테스트 데이터 막기 */
describe.skipIf(!emulatorHost)('어제의 KBO 퀴즈 규칙', () => {
  let env: RulesTestEnvironment;
  const DAY = '2026-11-21';
  const past = () => Timestamp.fromMillis(Date.now() - 3_600_000);
  const future = () => Timestamp.fromMillis(Date.now() + 3_600_000);
  const question = (index: number) => ({
    stem: `문제 ${index}`,
    options: ['A', 'B', 'C', 'D'].map((label) => ({ label, text: `${index}${label}` })),
    difficulty: 'easy',
    category: 'team-history',
    recordAsOf: '2026-11-11',
    seasonScope: '2026 시즌',
  });
  const baseSet = (patch: object = {}) => ({
    kind: 'quiz',
    gamesDate: '2026-11-20',
    publishAt: past(),
    questions: [question(0), question(1)],
    state: 'approved',
    withdrawn: [],
    isTest: false,
    updatedAt: Timestamp.now(),
    by: 'ops',
    ...patch,
  });

  const admin = (): Firestore =>
    env
      .authenticatedContext('boss', { admin: true, email_verified: true, firebase: { sign_in_provider: 'google.com' } })
      .firestore() as unknown as Firestore;

  async function seed(day = DAY, data: object = baseSet()) {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, `kboSets/${day}`), data);
      await setDoc(doc(db, `kboSets/${day}/keys/0`), { correct: 'A', explanation: '해설', sourceName: '출처', sourceUrl: 'https://example.test', recordAsOf: '2026-11-11' });
      await setDoc(doc(db, `kboSets/${day}/keys/1`), { correct: 'B', explanation: '해설', sourceName: '출처', sourceUrl: 'https://example.test', recordAsOf: '2026-11-11' });
    });
  }

  const start = (db: Firestore, uid = 'g1', patch: object = {}, day = DAY) =>
    setDoc(doc(db, `kboSets/${day}/attempts/${uid}`), { guest: true, total: 2, answers: {}, viewedAt: serverTimestamp(), ...patch });
  const answer = (db: Firestore, index: number, choice: string | null = 'A', uid = 'g1') =>
    updateDoc(doc(db, `kboSets/${DAY}/attempts/${uid}`), { [`answers.${index}`]: { choice, at: serverTimestamp() } });

  beforeAll(async () => {
    env = await startRulesEnv('kbo');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed();
  });
  afterAll(async () => {
    await env.cleanup();
  });

  describe('묶음 읽기', () => {
    it('공개된 묶음은 로그인 없이도, 없는 날은 없다고 읽힌다', async () => {
      await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, `kboSets/${DAY}`)));
      await assertSucceeds(getDoc(doc(guest(env, 'g1'), 'kboSets/2026-01-01')));
    });

    it('초안·보류·공개 시각 전·테스트 데이터는 이용자에게 막는다', async () => {
      await seed('2026-11-22', baseSet({ state: 'draft' }));
      await seed('2026-11-23', baseSet({ state: 'held' }));
      await seed('2026-11-24', baseSet({ publishAt: future() }));
      await seed('2026-11-25', baseSet({ isTest: true }));
      for (const day of ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']) {
        await assertFails(getDoc(doc(guest(env, 'g1'), `kboSets/${day}`)));
        await assertFails(getDoc(doc(member(env, 'm1'), `kboSets/${day}`)));
        await assertSucceeds(getDoc(doc(admin(), `kboSets/${day}`)));
      }
    });

    it('목록은 관리자만', async () => {
      await assertFails(getDocs(collection(guest(env, 'g1'), 'kboSets')));
      await assertSucceeds(getDocs(collection(admin(), 'kboSets')));
    });
  });

  describe('정답 보호', () => {
    it('시도 전에는 정답을 못 읽는다', async () => {
      await assertFails(getDoc(doc(guest(env, 'g1'), `kboSets/${DAY}/keys/0`)));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore() as unknown as Firestore, `kboSets/${DAY}/keys/0`)));
    });

    it('답을 내기 전에는 못 읽고, 낸 문제만 읽는다', async () => {
      const db = guest(env, 'g1');
      await assertSucceeds(start(db));
      await assertFails(getDoc(doc(db, `kboSets/${DAY}/keys/0`)));
      await assertSucceeds(answer(db, 0));
      await assertSucceeds(getDoc(doc(db, `kboSets/${DAY}/keys/0`)));
      await assertFails(getDoc(doc(db, `kboSets/${DAY}/keys/1`)));
    });

    it('목록으로 한꺼번에 읽을 수 없다', async () => {
      const db = guest(env, 'g1');
      await assertSucceeds(start(db));
      await assertSucceeds(answer(db, 0));
      await assertFails(getDocs(collection(db, `kboSets/${DAY}/keys`)));
    });

    it('남의 시도로 정답을 열 수 없고, 남의 시도를 읽거나 쓸 수 없다', async () => {
      await assertSucceeds(start(guest(env, 'g1')));
      await assertSucceeds(answer(guest(env, 'g1'), 0));
      const other = guest(env, 'g2');
      await assertFails(getDoc(doc(other, `kboSets/${DAY}/keys/0`)));
      await assertFails(getDoc(doc(other, `kboSets/${DAY}/attempts/g1`)));
      await assertFails(answer(other, 1, 'A', 'g1'));
      await assertFails(start(other, 'g1'));
    });

    it('이상한 문제 번호로 정답을 열 수 없다', async () => {
      const db = guest(env, 'g1');
      await assertSucceeds(start(db));
      await assertSucceeds(answer(db, 0));
      await assertFails(getDoc(doc(db, `kboSets/${DAY}/keys/abc`)));
    });
  });

  describe('답 내기', () => {
    it('낸 답은 고칠 수 없고, 건너뛸 수 없고, 문제 수를 넘길 수 없다', async () => {
      const db = guest(env, 'g1');
      await assertSucceeds(start(db));
      await assertFails(answer(db, 1)); // 건너뛰기
      await assertSucceeds(answer(db, 0, 'B'));
      await assertFails(answer(db, 0, 'A')); // 고치기
      await assertSucceeds(answer(db, 1, null)); // 시간 초과
      await assertFails(answer(db, 2)); // 넘기기
    });

    it('이상한 답·기기 시각·다른 칸은 막는다', async () => {
      const db = guest(env, 'g1');
      await assertSucceeds(start(db));
      await assertFails(answer(db, 0, 'E'));
      await assertFails(updateDoc(doc(db, `kboSets/${DAY}/attempts/g1`), { 'answers.0': { choice: 'A', at: Timestamp.now() } }));
      await assertFails(updateDoc(doc(db, `kboSets/${DAY}/attempts/g1`), { 'answers.0': { choice: 'A', at: serverTimestamp(), correct: true } }));
      await assertFails(updateDoc(doc(db, `kboSets/${DAY}/attempts/g1`), { total: 99 }));
      await assertFails(updateDoc(doc(db, `kboSets/${DAY}/attempts/g1`), { score: 100 }));
    });

    it('시도는 공개된 풀이 묶음에만, 값이 맞을 때만 만든다', async () => {
      await seed('2026-11-22', baseSet({ state: 'draft' }));
      await seed('2026-11-23', baseSet({ isTest: true }));
      await seed('2026-11-24', baseSet({ kind: 'no-game', questions: [] }));
      const db = guest(env, 'g1');
      await assertFails(start(db, 'g1', {}, '2026-11-22'));
      await assertFails(start(db, 'g1', {}, '2026-11-23'));
      await assertFails(start(db, 'g1', { total: 0 }, '2026-11-24'));
      await assertFails(start(db, 'g1', { total: 9 }));
      await assertFails(start(db, 'g1', { guest: false })); // 비회원이 회원이라고 적기
      await assertFails(start(db, 'g1', { answers: { 0: { choice: 'A' } } }));
      await assertFails(start(db, 'g1', { viewedAt: Timestamp.now() }));
      await assertFails(start(db, 'g1', { score: 5 }));
      await assertSucceeds(start(db));
    });

    it('회원은 만 14세 확인 뒤에 풀고, 회원으로 표시된다', async () => {
      const db = member(env, 'm1');
      await assertFails(start(db, 'm1', { guest: false }));
      await seedConfirmedMember(env, 'm1');
      await assertFails(start(db, 'm1', { guest: true }));
      await assertSucceeds(start(db, 'm1', { guest: false }));
    });

    it('가입 단추는 한 번, 서버 시각으로만', async () => {
      const db = guest(env, 'g1');
      await assertSucceeds(start(db));
      await assertFails(updateDoc(doc(db, `kboSets/${DAY}/attempts/g1`), { signupClickedAt: Timestamp.now() }));
      await assertSucceeds(updateDoc(doc(db, `kboSets/${DAY}/attempts/g1`), { signupClickedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(db, `kboSets/${DAY}/attempts/g1`), { signupClickedAt: serverTimestamp() }));
    });

    it('본인 시도를 지울 수 있다(탈퇴) — 없는 문서도', async () => {
      const db = guest(env, 'g1');
      await assertSucceeds(start(db));
      await assertSucceeds(deleteDoc(doc(db, `kboSets/${DAY}/attempts/g1`)));
      await assertSucceeds(deleteDoc(doc(db, 'kboSets/2026-01-01/attempts/g1')));
      await assertFails(deleteDoc(doc(guest(env, 'g2'), `kboSets/${DAY}/attempts/g1`)));
    });
  });

  describe('관리자', () => {
    const adminSet = (patch: object = {}) => ({ ...baseSet(), publishAt: future(), state: 'draft', updatedAt: serverTimestamp(), by: 'boss', ...patch });

    it('이용자는 묶음·정답·경기·집계를 쓸 수 없고 경기·집계를 읽을 수 없다', async () => {
      for (const db of [guest(env, 'g1'), member(env, 'm1')]) {
        await assertFails(setDoc(doc(db, 'kboSets/2026-11-30'), adminSet({ by: 'g1' })));
        await assertFails(updateDoc(doc(db, `kboSets/${DAY}`), { state: 'held' }));
        await assertFails(setDoc(doc(db, `kboSets/${DAY}/keys/0`), { correct: 'B' }));
        await assertFails(getDoc(doc(db, 'kboGames/x')));
        await assertFails(setDoc(doc(db, 'kboGames/x'), { a: 1 }));
        await assertFails(getDoc(doc(db, `kboSets/${DAY}/stats/summary`)));
        await assertFails(setDoc(doc(db, 'adminConfig/kboQuiz'), { questionCount: 5, updatedAt: serverTimestamp(), by: 'g1' }));
      }
    });

    it('관리자도 경기·집계는 쓰지 못한다(운영자 PC만), 읽기는 된다', async () => {
      await assertFails(setDoc(doc(admin(), 'kboGames/x'), { a: 1 }));
      await assertSucceeds(getDoc(doc(admin(), 'kboGames/x')));
      await assertFails(setDoc(doc(admin(), `kboSets/${DAY}/stats/summary`), { views: 1 }));
      await assertSucceeds(getDoc(doc(admin(), `kboSets/${DAY}/stats/summary`)));
    });

    it('테스트 데이터로 만들거나, 테스트 데이터를 실제로 바꿀 수 없다', async () => {
      await assertFails(setDoc(doc(admin(), 'kboSets/2026-11-30'), adminSet({ isTest: true })));
      await seed('2026-11-29', { ...baseSet(), isTest: true, state: 'draft' });
      await assertFails(updateDoc(doc(admin(), 'kboSets/2026-11-29'), { isTest: false, updatedAt: serverTimestamp(), by: 'boss' }));
      await assertSucceeds(updateDoc(doc(admin(), 'kboSets/2026-11-29'), { state: 'approved', updatedAt: serverTimestamp(), by: 'boss' }));
      await assertFails(getDoc(doc(guest(env, 'g1'), 'kboSets/2026-11-29'))); // 승인해도 열리지 않는다
    });

    it('공개 뒤에는 문항·정답을 못 바꾸고, 내리거나 철회는 된다', async () => {
      const db = admin();
      await assertFails(updateDoc(doc(db, `kboSets/${DAY}`), { questions: [question(9)], updatedAt: serverTimestamp(), by: 'boss' }));
      await assertFails(updateDoc(doc(db, `kboSets/${DAY}`), { publishAt: future(), updatedAt: serverTimestamp(), by: 'boss' }));
      await assertFails(updateDoc(doc(db, `kboSets/${DAY}`), { state: 'draft', updatedAt: serverTimestamp(), by: 'boss' }));
      await assertFails(setDoc(doc(db, `kboSets/${DAY}/keys/0`), { correct: 'C' }));
      await assertSucceeds(updateDoc(doc(db, `kboSets/${DAY}`), { withdrawn: [1], updatedAt: serverTimestamp(), by: 'boss' }));
      await assertSucceeds(updateDoc(doc(db, `kboSets/${DAY}`), { state: 'held', updatedAt: serverTimestamp(), by: 'boss' }));
      await assertFails(deleteDoc(doc(db, `kboSets/${DAY}`)));
    });

    it('공개 전에는 묶음·정답을 함께 쓴다(10문항)', async () => {
      const db = admin();
      await assertSucceeds(setDoc(doc(db, 'kboSets/2026-11-30'), adminSet({ questions: Array.from({ length: 10 }, (_, index) => question(index)) })));
      await assertSucceeds(setDoc(doc(db, 'kboSets/2026-11-30/keys/9'), { correct: 'A' }));
      await assertFails(setDoc(doc(db, 'kboSets/2026-11-31'), adminSet({ questions: Array.from({ length: 11 }, (_, index) => question(index)) })));
      await assertFails(setDoc(doc(db, 'kboSets/오늘'), adminSet()));
      await assertFails(setDoc(doc(db, 'kboSets/2026-12-01'), adminSet({ extra: 1 })));
    });

    it('문제 수 설정은 범위 안에서만', async () => {
      const db = admin();
      await assertSucceeds(setDoc(doc(db, 'adminConfig/kboQuiz'), { questionCount: 7, updatedAt: serverTimestamp(), by: 'boss' }));
      await assertFails(setDoc(doc(db, 'adminConfig/kboQuiz'), { questionCount: 11, updatedAt: serverTimestamp(), by: 'boss' }));
      await assertFails(setDoc(doc(db, 'adminConfig/kboRuns'), { runs: [], updatedAt: serverTimestamp(), by: 'boss' }));
    });
  });
});
