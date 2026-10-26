import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

/**
 * Firestore 보안 규칙 — users/{uid} (1단계, 만 14세 확인).
 *
 * Firestore 에뮬레이터가 필요하다(JDK 21). `npm run test:rules`가 에뮬레이터를
 * 띄우고 FIRESTORE_EMULATOR_HOST를 넣어 이 파일을 돌린다. 에뮬레이터가 없으면 건너뛴다.
 */
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!emulatorHost)('users/{uid} 보안 규칙', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    const [host, port] = (emulatorHost ?? '127.0.0.1:8080').split(':');
    env = await initializeTestEnvironment({
      projectId: 'demo-yaguking',
      firestore: {
        host: host!,
        port: Number(port),
        rules: readFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await env.clearFirestore();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  const member = (uid: string) =>
    env.authenticatedContext(uid, { firebase: { sign_in_provider: 'password' } }).firestore();
  const guest = (uid: string) =>
    env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  const confirm = { ageConfirmedAt: serverTimestamp(), createdAt: serverTimestamp() };

  it('회원은 자기 프로필을 서버 시각으로 만들 수 있다(만 14세 확인)', async () => {
    await assertSucceeds(setDoc(doc(member('alice'), 'users/alice'), confirm));
    await assertSucceeds(getDoc(doc(member('alice'), 'users/alice')));
  });

  it('기기 시각으로 지어낸 확인 시각은 거절한다', async () => {
    const forged = { ageConfirmedAt: Timestamp.fromMillis(0), createdAt: serverTimestamp() };
    await assertFails(setDoc(doc(member('alice'), 'users/alice'), forged));
  });

  it('정해진 필드 말고는 받지 않는다', async () => {
    await assertFails(setDoc(doc(member('alice'), 'users/alice'), { ...confirm, level: 7 }));
  });

  it('남의 프로필은 만들지도 읽지도 못한다', async () => {
    await assertFails(setDoc(doc(member('mallory'), 'users/alice'), confirm));
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice'), { ageConfirmedAt: Timestamp.now() });
    });
    await assertFails(getDoc(doc(member('mallory'), 'users/alice')));
  });

  it('비회원(익명)은 프로필을 만들 수 없다 — 나이 확인은 회원만', async () => {
    await assertFails(setDoc(doc(guest('anon'), 'users/anon'), confirm));
  });

  it('로그인하지 않으면 아무것도 못 한다', async () => {
    const anonymous = env.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anonymous, 'users/x'), confirm));
    await assertFails(getDoc(doc(anonymous, 'users/x')));
  });

  it('확인 시각은 고칠 수 없다', async () => {
    await assertSucceeds(setDoc(doc(member('alice'), 'users/alice'), confirm));
    await assertFails(updateDoc(doc(member('alice'), 'users/alice'), { ageConfirmedAt: serverTimestamp() }));
  });

  it('본인은 프로필을 지울 수 있고, 남은 못 지운다', async () => {
    await assertSucceeds(setDoc(doc(member('alice'), 'users/alice'), confirm));
    await assertFails(deleteDoc(doc(member('mallory'), 'users/alice')));
    await assertSucceeds(deleteDoc(doc(member('alice'), 'users/alice')));
  });

  it('정해지지 않은 경로는 전부 막힌다', async () => {
    await assertFails(setDoc(doc(member('alice'), 'anything/else'), { a: 1 }));
    await assertFails(getDoc(doc(member('alice'), 'anything/else')));
  });
});
