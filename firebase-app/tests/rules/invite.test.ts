import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { emulatorHost, guest, member, seedConfirmedMember, startRulesEnv } from './setup';

/** 친구 초대 1단계 — 코드는 내 것 하나, 받은 코드는 가입 후 7일 안에 한 번(남의 코드만), 진행 기록은 운영자 PC만 쓴다 */
describe.skipIf(!emulatorHost)('친구 초대 규칙', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await startRulesEnv('invite');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await seedConfirmedMember(env, 'alice', { nickname: '앨리스' });
    await seedConfirmedMember(env, 'bob', { nickname: '밥' });
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'invites/ALXCE2'), { uid: 'alice', createdAt: Timestamp.now() });
      await setDoc(doc(context.firestore(), 'users/alice'), { inviteCode: 'ALXCE2' }, { merge: true });
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });

  const makeCode = (db: ReturnType<typeof member>, uid: string, code: string) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'invites', code), { uid, createdAt: serverTimestamp() });
    batch.update(doc(db, 'users', uid), { inviteCode: code, updatedAt: serverTimestamp() });
    return batch.commit();
  };
  const link = (db: ReturnType<typeof member>, uid: string, code: string, extra: object = {}) =>
    updateDoc(doc(db, 'users', uid), { invitedBy: code, invitedAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra });

  it('내 코드: 코드 문서와 내 프로필을 한 묶음으로, 한 번만', async () => {
    const db = member(env, 'bob');
    await assertSucceeds(makeCode(db, 'bob', 'BXBBY7'));
    await assertFails(makeCode(db, 'bob', 'BXBBY8')); // 두 번째 코드
  });

  it('내 코드: 이미 있는 코드·남의 uid·형식이 틀린 코드·프로필 없이 코드만은 거절', async () => {
    const db = member(env, 'bob');
    await assertFails(makeCode(db, 'bob', 'ALXCE2')); // 앨리스 코드
    await assertFails(makeCode(db, 'bob', 'BOB0O1')); // 0·O·1 금지
    await assertFails(makeCode(db, 'bob', 'BXBBI7')); // I 금지
    await assertFails(setDoc(doc(db, 'invites/BXBBY9'), { uid: 'bob', createdAt: serverTimestamp() })); // 프로필에 코드 없음
    await assertFails(setDoc(doc(db, 'invites/BXBBY9'), { uid: 'alice', createdAt: serverTimestamp() }));
    await assertFails(makeCode(guest(env, 'carol'), 'carol', 'CARXL2')); // 비회원
  });

  it('코드 하나는 회원이 확인할 수 있고, 목록은 안 되고, 고치기는 안 된다', async () => {
    await assertSucceeds(getDoc(doc(member(env, 'bob'), 'invites/ALXCE2')));
    await assertFails(getDocs(collection(member(env, 'bob'), 'invites')));
    await assertFails(getDoc(doc(guest(env, 'carol'), 'invites/ALXCE2')));
    await assertFails(updateDoc(doc(member(env, 'alice'), 'invites/ALXCE2'), { uid: 'bob' }));
  });

  it('받은 코드: 가입 후 7일 안, 남의 코드, 한 번만, 서버 시각', async () => {
    const db = member(env, 'bob');
    await assertFails(link(db, 'bob', 'ALXCE2', { invitedAt: new Date() })); // 기기 시각
    await assertSucceeds(link(db, 'bob', 'ALXCE2'));
    await assertFails(link(db, 'bob', 'ALXCE2')); // 두 번째
  });

  it('받은 코드: 내 코드·없는 코드·닉네임 전·가입 7일 지남은 거절', async () => {
    await assertFails(link(member(env, 'alice'), 'alice', 'ALXCE2'));
    await assertFails(link(member(env, 'bob'), 'bob', 'ZZZZZZ'));
    await seedConfirmedMember(env, 'dan');
    await assertFails(link(member(env, 'dan'), 'dan', 'ALXCE2')); // 닉네임 없음
    await seedConfirmedMember(env, 'eve', { nickname: '이브', createdAt: Timestamp.fromMillis(Date.now() - 8 * 86_400_000) });
    await assertFails(link(member(env, 'eve'), 'eve', 'ALXCE2'));
  });

  it('시각만 바꾸거나 연결을 지우는 것은 거절', async () => {
    const db = member(env, 'bob');
    await assertSucceeds(link(db, 'bob', 'ALXCE2'));
    await assertFails(updateDoc(doc(db, 'users/bob'), { invitedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'users/bob'), { invitedBy: null, updatedAt: serverTimestamp() }));
  });

  it('진행 기록: 초대한 사람과 받은 사람만 읽고, 기기는 쓰지 못한다', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'inviteLedger/bob'), { inviter: 'alice', invitee: 'bob', nickname: '밥', status: 'joined' });
    });
    await assertSucceeds(getDocs(query(collection(member(env, 'alice'), 'inviteLedger'), where('inviter', '==', 'alice'))));
    await assertSucceeds(getDoc(doc(member(env, 'bob'), 'inviteLedger/bob')));
    await seedConfirmedMember(env, 'mallory', { nickname: '말로리' });
    await assertFails(getDoc(doc(member(env, 'mallory'), 'inviteLedger/bob')));
    await assertFails(getDocs(collection(member(env, 'mallory'), 'inviteLedger')));
    await assertFails(setDoc(doc(member(env, 'alice'), 'inviteLedger/bob'), { inviter: 'alice', status: 'rewarded' }));
    await assertFails(setDoc(doc(member(env, 'bob'), 'users/bob/meta/invites'), { bonus: 9999 }));
  });

  it('탈퇴할 때 내 코드 문서를 지운다(남의 코드는 못 지움)', async () => {
    await assertFails(deleteDoc(doc(member(env, 'bob'), 'invites/ALXCE2')));
    await assertSucceeds(deleteDoc(doc(member(env, 'alice'), 'invites/ALXCE2')));
  });
});
