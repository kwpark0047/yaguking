import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulatorHost, guest, member, seedConfirmedMember, startRulesEnv } from './setup';

/** 힌트 지갑(docs/hint-plan.md §3) — 모은 포인트는 운영자 PC만, 기기는 쓴 포인트를 힌트 값만큼만 올린다 */
describe.skipIf(!emulatorHost)('힌트 지갑 규칙', () => {
  let env: RulesTestEnvironment;
  const path = 'users/alice/wallet/main';

  beforeAll(async () => {
    env = await startRulesEnv('wallet');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedConfirmedMember(env, 'alice');
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), path), { earned: 100, spent: 40, earnedThrough: '2026-11-10', updatedAt: new Date() });
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });

  const spend = (spent: unknown, extra: object = {}) => updateDoc(doc(member(env, 'alice'), path), { spent, updatedAt: serverTimestamp(), ...extra } as never);

  it('본인은 힌트 값(20·30)만큼 올린다 — 증가 연산도 같다', async () => {
    await assertSucceeds(spend(60));
    await assertSucceeds(spend(90));
    await assertFails(spend(120)); // 모은 100을 넘는다
  });

  it('값이 다르거나 줄이면 거절', async () => {
    await assertFails(spend(50)); // +10
    await assertFails(spend(61)); // +21
    await assertFails(spend(100)); // +60
    await assertFails(spend(20)); // 줄임
    await assertFails(spend(40)); // 그대로
    await assertSucceeds(updateDoc(doc(member(env, 'alice'), path), { spent: increment(20), updatedAt: serverTimestamp() }));
  });

  it('모은 포인트를 넘으면 거절', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), path), { earned: 50, spent: 40, updatedAt: new Date() });
    });
    await assertFails(spend(60));
  });

  it('모은 포인트·기준일·다른 칸·기기 시각은 거절', async () => {
    await assertFails(spend(60, { earned: 1000 }));
    await assertFails(spend(60, { earnedThrough: '2099-01-01' }));
    await assertFails(spend(60, { bonus: 1 }));
    await assertFails(updateDoc(doc(member(env, 'alice'), path), { earned: 1000, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(member(env, 'alice'), path), { spent: 60, updatedAt: new Date() }));
    await assertFails(updateDoc(doc(member(env, 'alice'), path), { spent: 60 }));
  });

  it('기기는 지갑을 만들 수 없다(본인이어도, 덮어쓰기도)', async () => {
    await seedConfirmedMember(env, 'bob');
    await assertFails(setDoc(doc(member(env, 'bob'), 'users/bob/wallet/main'), { earned: 1000, spent: 0, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(member(env, 'alice'), path), { earned: 1000, spent: 40, updatedAt: serverTimestamp() }));
  });

  it('다른 문서 이름은 고칠 수 없다', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice/wallet/other'), { earned: 100, spent: 0, updatedAt: new Date() });
    });
    await assertFails(updateDoc(doc(member(env, 'alice'), 'users/alice/wallet/other'), { spent: 20, updatedAt: serverTimestamp() }));
  });

  it('본인만 읽고 쓰고 지운다 — 남·비회원·확인 전 회원은 거절', async () => {
    await assertSucceeds(getDoc(doc(member(env, 'alice'), path)));
    await assertFails(getDoc(doc(member(env, 'mallory'), path)));
    await assertFails(updateDoc(doc(member(env, 'mallory'), path), { spent: 60, updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(member(env, 'mallory'), path)));

    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/newbie/wallet/main'), { earned: 100, spent: 0, updatedAt: new Date() });
      await setDoc(doc(context.firestore(), 'users/gus/wallet/main'), { earned: 100, spent: 0, updatedAt: new Date() });
    });
    await assertFails(updateDoc(doc(member(env, 'newbie'), 'users/newbie/wallet/main'), { spent: 20, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(guest(env, 'gus'), 'users/gus/wallet/main'), { spent: 20, updatedAt: serverTimestamp() }));

    await assertSucceeds(deleteDoc(doc(member(env, 'alice'), path))); // 탈퇴할 때
  });
});
