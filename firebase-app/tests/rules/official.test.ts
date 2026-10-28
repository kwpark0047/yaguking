import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, Timestamp, updateDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulatorHost, guest, member, now, seedConfirmedMember, startRulesEnv } from './setup';

/** 오늘의 공식전 — 배포 규칙(firestore.rules). 설계 가정은 official-prototype.test.ts에서 따로 확인했다 */
const TODAY = '20261105';
const PAST = '20261104';
const attempt = (round = TODAY, uid = 'alice') => `officialRounds/${round}/attempts/${uid}`;

describe.skipIf(!emulatorHost)('오늘의 공식전 규칙', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await startRulesEnv('official-live');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedConfirmedMember(env, 'alice');
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const round = async (id: string, opensAt: number, closesAt: number) => {
        await setDoc(doc(db, `officialRounds/${id}`), { total: 3, opensAt: Timestamp.fromMillis(opensAt), closesAt: Timestamp.fromMillis(closesAt) });
        for (const index of [0, 1, 2]) await setDoc(doc(db, `officialRounds/${id}/questions/${index}`), { stem: `문제 ${index}` });
      };
      await round(TODAY, Date.now() - 60_000, Date.now() + 3_600_000); // 열림
      await round(PAST, Date.now() - 86_400_000, Date.now() - 60_000); // 닫힘
      await setDoc(doc(db, `officialKeys/${TODAY}`), { answers: ['A', 'B', 'C'] });
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });

  const start = (db: Firestore, round = TODAY, overrides: object = {}) =>
    setDoc(doc(db, attempt(round)), { startedAt: now(), total: 3, answers: {}, ...overrides });
  const answer = (db: Firestore, index: number, choice: string | null, round = TODAY) =>
    updateDoc(doc(db, attempt(round)), { [`answers.${index}`]: { choice, at: now() } });

  it('시작해야 첫 문제, 답해야 다음 문제가 열린다', async () => {
    const db = member(env, 'alice');
    await assertFails(getDoc(doc(db, `officialRounds/${TODAY}/questions/0`)));
    await assertSucceeds(start(db));
    await assertSucceeds(getDoc(doc(db, `officialRounds/${TODAY}/questions/0`)));
    await assertFails(getDoc(doc(db, `officialRounds/${TODAY}/questions/1`)));
    await assertSucceeds(answer(db, 0, 'A'));
    await assertSucceeds(getDoc(doc(db, `officialRounds/${TODAY}/questions/1`)));
    await assertFails(getDoc(doc(db, `officialRounds/${TODAY}/questions/2`)));
  });

  it('답은 차례대로 하나씩, 서버 시각만, 고쳐 쓰기·건너뛰기·다른 필드 거절, 하루 한 번', async () => {
    const db = member(env, 'alice');
    await assertSucceeds(start(db));
    await assertFails(start(db)); // 다시 시작
    await assertFails(answer(db, 1, 'A')); // 건너뛰기
    await assertFails(updateDoc(doc(db, attempt()), { 'answers.0': { choice: 'A', at: Timestamp.now() } })); // 기기 시각
    await assertFails(answer(db, 0, 'E'));
    await assertSucceeds(answer(db, 0, null)); // 시간 초과
    await assertFails(answer(db, 0, 'B')); // 고쳐 쓰기
    await assertFails(updateDoc(doc(db, attempt()), { total: 1 }));
    await assertFails(getDoc(doc(member(env, 'bob'), attempt())));
  });

  it('닫힌 공식전·시작 시각 지어내기·문항 수 바꾸기·비회원·확인 전 회원은 시작할 수 없다', async () => {
    await assertFails(start(member(env, 'alice'), PAST));
    await assertFails(start(member(env, 'alice'), TODAY, { startedAt: Timestamp.fromMillis(Date.now() - 10_000) }));
    await assertFails(start(member(env, 'alice'), TODAY, { total: 1 }));
    await assertFails(setDoc(doc(guest(env, 'gus'), attempt(TODAY, 'gus')), { startedAt: now(), total: 3, answers: {} }));
    await assertFails(setDoc(doc(member(env, 'newbie'), attempt(TODAY, 'newbie')), { startedAt: now(), total: 3, answers: {} }));
  });

  it('기한(문항당 16초 + 1초)이 지나면 답을 받지 않는다', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), attempt()), { startedAt: Timestamp.fromMillis(Date.now() - 60_000), total: 3, answers: {} });
    });
    await assertFails(answer(member(env, 'alice'), 0, 'A'));
  });

  it('닫힌 공식전은 회원 누구나 문제를 다시 본다(정답은 아무도 못 읽음)', async () => {
    await assertSucceeds(getDoc(doc(member(env, 'bob'), `officialRounds/${PAST}/questions/2`)));
    await assertFails(getDoc(doc(guest(env, 'gus'), `officialRounds/${PAST}/questions/2`)));
    await assertFails(getDoc(doc(member(env, 'alice'), `officialKeys/${TODAY}`)));
  });

  it('내 답은 닫힌 공식전(또는 없는 공식전)에서만 지운다 — 열린 동안 지우고 다시 풀기 금지', async () => {
    const db = member(env, 'alice');
    await assertSucceeds(start(db));
    await assertFails(deleteDoc(doc(db, attempt())));
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), attempt(PAST)), { startedAt: Timestamp.now(), total: 3, answers: {} });
    });
    await assertSucceeds(deleteDoc(doc(db, attempt(PAST))));
    await assertSucceeds(deleteDoc(doc(db, attempt('20260101'))));
    await assertFails(deleteDoc(doc(member(env, 'bob'), attempt(PAST))));
  });

  it('공식 점수는 운영자 PC만 쓴다 — 본인만 읽고 지운다', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice/officialMonth/202611'), { days: { [TODAY]: 300 } });
    });
    await assertSucceeds(getDoc(doc(member(env, 'alice'), 'users/alice/officialMonth/202611')));
    await assertFails(getDoc(doc(member(env, 'bob'), 'users/alice/officialMonth/202611')));
    await assertFails(setDoc(doc(member(env, 'alice'), 'users/alice/officialMonth/202612'), { days: { '20261201': 770 } }));
    await assertFails(setDoc(doc(member(env, 'alice'), 'officialRounds/20261201'), { total: 1 }));
    await assertSucceeds(deleteDoc(doc(member(env, 'alice'), 'users/alice/officialMonth/202611')));
  });
});
