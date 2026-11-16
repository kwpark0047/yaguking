import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulatorHost, guest, kstDayKey, member, seedConfirmedMember, startRulesEnv } from './setup';

/** 유입 출처(docs/measurement-plan.md 2단계) — 비회원 본인만, 만들기만, 정한 칸·목록·오늘 날짜만 */
describe.skipIf(!emulatorHost)('유입 출처 규칙', () => {
  let env: RulesTestEnvironment;
  const path = 'users/g1/meta/acquisition';
  const today = () => Number(kstDayKey());
  const valid = () => ({ source: 'instagram', campaign: 'launch-1125', day: today() });

  beforeAll(async () => {
    env = await startRulesEnv('acquisition');
  });
  beforeEach(async () => {
    await env.clearFirestore();
  });
  afterAll(async () => {
    await env.cleanup();
  });

  it('비회원 본인은 한 번 만들고, 읽고, 지울 수 있다', async () => {
    await assertSucceeds(setDoc(doc(guest(env, 'g1'), path), valid()));
    await assertSucceeds(getDoc(doc(guest(env, 'g1'), path)));
    await assertSucceeds(deleteDoc(doc(guest(env, 'g1'), path)));
  });

  it('캠페인은 비어도 된다, 출처는 목록 안 어느 것이든', async () => {
    await assertSucceeds(setDoc(doc(guest(env, 'g1'), path), { source: 'etc', campaign: '', day: today() }));
    await assertSucceeds(setDoc(doc(guest(env, 'g2'), 'users/g2/meta/acquisition'), { source: 'share', campaign: 'daily', day: today() }));
  });

  it('고치기·덮어쓰기는 거절(처음 출처 그대로)', async () => {
    await assertSucceeds(setDoc(doc(guest(env, 'g1'), path), valid()));
    await assertFails(setDoc(doc(guest(env, 'g1'), path), { ...valid(), source: 'threads' }));
    await assertFails(updateDoc(doc(guest(env, 'g1'), path), { campaign: 'other' }));
  });

  it('목록 밖 출처·긴 캠페인·대문자·다른 칸·다른 날짜는 거절', async () => {
    const write = (data: object) => setDoc(doc(guest(env, 'g1'), path), data);
    await assertFails(write({ ...valid(), source: 'naver' }));
    await assertFails(write({ ...valid(), campaign: 'a'.repeat(41) }));
    await assertFails(write({ ...valid(), campaign: 'Launch' }));
    await assertFails(write({ ...valid(), campaign: 'https://example.com' }));
    await assertFails(write({ ...valid(), referrer: 'https://example.com' }));
    await assertFails(write({ ...valid(), day: today() - 1 }));
    await assertFails(write({ source: 'instagram', day: today() }));
  });

  it('다른 문서 이름·남의 계정·회원은 거절, 남은 읽지 못한다', async () => {
    await assertFails(setDoc(doc(guest(env, 'g1'), 'users/g1/meta/other'), valid()));
    await assertFails(setDoc(doc(guest(env, 'g2'), path), valid()));
    await seedConfirmedMember(env, 'alice');
    await assertFails(setDoc(doc(member(env, 'alice'), 'users/alice/meta/acquisition'), valid()));
    await assertSucceeds(setDoc(doc(guest(env, 'g1'), path), valid()));
    await assertFails(getDoc(doc(guest(env, 'g2'), path)));
    await assertFails(deleteDoc(doc(guest(env, 'g2'), path)));
  });
});
