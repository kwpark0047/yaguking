import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteField, doc, getDoc, setDoc, Timestamp, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulatorHost, guest, member, now, seedConfirmedMember, startRulesEnv } from './setup';

/**
 * 7단계 설계(docs/official-xp-rp.md)의 가정 확인 — **시험용 규칙**(docs/prototypes/official.rules)으로.
 * 배포 규칙(firestore.rules)은 바꾸지 않는다. 마지막 묶음은 배포 규칙에서 공식 문서가 막혀 있는지 본다.
 */
const ROUND = '20261027';
const attempt = `officialRounds/${ROUND}/attempts/alice`;

describe.skipIf(!emulatorHost)('공식전 설계 가정(시험용 규칙)', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await startRulesEnv('official', '../../docs/prototypes/official.rules');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const opensAt = Timestamp.fromMillis(Date.now() - 60_000);
      await setDoc(doc(db, `officialRounds/${ROUND}`), { total: 3, opensAt });
      for (const index of [0, 1, 2]) {
        await setDoc(doc(db, `officialRounds/${ROUND}/questions/${index}`), { stem: `문제 ${index}`, opensAt });
      }
      await setDoc(doc(db, `officialKeys/${ROUND}`), { answers: ['A', 'B', 'C'] });
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });

  const start = (db: Firestore, overrides: object = {}) =>
    setDoc(doc(db, attempt), { startedAt: now(), total: 3, answers: {}, graded: false, ...overrides });

  const answer = (db: Firestore, index: number, choice: string | null, at: unknown = now()) =>
    updateDoc(doc(db, attempt), { [`answers.${index}`]: { choice, at } });

  it('시작 전에는 첫 문제도 못 읽는다', async () => {
    await assertFails(getDoc(doc(member(env, 'alice'), `officialRounds/${ROUND}/questions/0`)));
  });

  it('하나씩 연다: 답한 만큼 + 다음 한 문제만 읽힌다', async () => {
    const db = member(env, 'alice');
    await assertSucceeds(start(db));
    await assertSucceeds(getDoc(doc(db, `officialRounds/${ROUND}/questions/0`)));
    await assertFails(getDoc(doc(db, `officialRounds/${ROUND}/questions/1`)));

    await assertSucceeds(answer(db, 0, 'A'));
    await assertSucceeds(getDoc(doc(db, `officialRounds/${ROUND}/questions/1`)));
    await assertFails(getDoc(doc(db, `officialRounds/${ROUND}/questions/2`)));
  });

  it('답의 시각은 서버 시각만 — 기기 시각·건너뛰기·고쳐 쓰기·몰아 쓰기 거절', async () => {
    const db = member(env, 'alice');
    await assertSucceeds(start(db));
    await assertFails(answer(db, 0, 'A', Timestamp.fromMillis(Date.now() - 10_000))); // 빨리 푼 척
    await assertFails(answer(db, 1, 'A')); // 0번을 건너뜀
    await assertFails(answer(db, 0, 'E')); // 없는 보기
    await assertSucceeds(answer(db, 0, null)); // 시간 초과도 답 하나
    await assertFails(answer(db, 0, 'B')); // 고쳐 쓰기
    await assertFails(
      updateDoc(doc(db, attempt), { 'answers.1': { choice: 'A', at: now() }, 'answers.2': { choice: 'B', at: now() } }),
    ); // 두 개 한꺼번에
    await assertFails(updateDoc(doc(db, attempt), { 'answers.0': deleteField() })); // 지우기
    await assertFails(updateDoc(doc(db, attempt), { graded: true })); // 판정 표시는 일꾼만
  });

  it('기한(문항당 16초 + 1초)이 지나면 답을 받지 않는다', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), attempt), {
        startedAt: Timestamp.fromMillis(Date.now() - 60_000), // 3문항 기한 49초가 지났다
        total: 3,
        answers: {},
        graded: false,
      });
    });
    await assertFails(answer(member(env, 'alice'), 0, 'A'));
  });

  it('시작 시각을 지어내거나, 하루 두 번 시작하거나, 비회원이면 거절', async () => {
    const db = member(env, 'alice');
    await assertFails(start(db, { startedAt: Timestamp.fromMillis(0) }));
    await assertFails(start(db, { total: 1 })); // 문항 수를 줄여 빨리 끝내기
    await assertSucceeds(start(db));
    await assertFails(start(db)); // 이미 있다 → "수정"이라 막힘
    await assertFails(
      setDoc(doc(guest(env, 'g1'), `officialRounds/${ROUND}/attempts/g1`), {
        startedAt: now(),
        total: 3,
        answers: {},
        graded: false,
      }),
    );
  });

  it('정답 문서는 기기가 못 읽고, 공식 통계는 기기가 못 쓴다', async () => {
    await seedConfirmedMember(env, 'alice');
    const db = member(env, 'alice');
    await assertFails(getDoc(doc(db, `officialKeys/${ROUND}`)));
    await assertFails(setDoc(doc(db, 'officialStats/alice'), { xp: 999_999 }));
  });
});

describe.skipIf(!emulatorHost)('배포 규칙: 공식 기록은 기기가 쓸 수 없다(설계 전에도)', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await startRulesEnv('official-prod');
  });
  afterAll(async () => {
    await env.cleanup();
  });

  it('공식 통계·결과·리더보드·정답·공식전 경로는 모두 막혀 있다', async () => {
    await seedConfirmedMember(env, 'alice');
    const db = member(env, 'alice');
    await assertFails(setDoc(doc(db, 'officialStats/alice'), { xp: 100 }));
    await assertFails(setDoc(doc(db, `officialResults/${ROUND}_alice`), { xp: 100 }));
    await assertFails(setDoc(doc(db, 'leaderboards/2026/entries/alice'), { score: 100 }));
    await assertFails(getDoc(doc(db, `officialKeys/${ROUND}`)));
    await assertFails(setDoc(doc(db, `officialRounds/${ROUND}/attempts/alice`), { answers: {} }));
  });
});
