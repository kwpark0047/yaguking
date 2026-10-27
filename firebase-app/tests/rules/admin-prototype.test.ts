import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { emulatorHost, now, startRulesEnv } from './setup';

/**
 * 관리자 기획(docs/admin-plan.md)의 가정 확인 — **시험용 규칙**(docs/prototypes/admin.rules). 배포 규칙은 바꾸지 않는다.
 */
describe.skipIf(!emulatorHost)('관리자 기획 가정(시험용 규칙)', () => {
  let env: RulesTestEnvironment;

  const as = (uid: string, token: object): Firestore =>
    env.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' }, ...token }).firestore() as unknown as Firestore;
  const admin = () => as('boss', { admin: true, email_verified: true, email: 'kwpark0047@gmail.com' });
  // 관리자와 같은 이메일이어도 admin 표시가 없으면 관리자가 아니다
  const sameEmailNoClaim = () => as('boss2', { email_verified: true, email: 'kwpark0047@gmail.com' });
  const unverifiedAdmin = () => as('boss3', { admin: true, email_verified: false });
  const player = () => as('alice', { email_verified: true });

  beforeAll(async () => {
    env = await startRulesEnv('admin', '../../docs/prototypes/admin.rules');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const uid of ['alice', 'bob']) {
        await setDoc(doc(db, `users/${uid}`), { nickname: uid });
        for (const id of ['g1', 'g2']) await setDoc(doc(db, `users/${uid}/games/${id}`), { runs: 2, createdAt: Timestamp.now() });
      }
      await setDoc(doc(db, 'public/home'), { notices: [] });
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });

  it('관리자 표시(admin)로만 다른 사람 프로필을 읽고 목록을 본다 — 같은 이메일·미인증은 안 됨', async () => {
    await assertSucceeds(getDoc(doc(admin(), 'users/alice')));
    await assertSucceeds(getDocs(collection(admin(), 'users')));
    await assertFails(getDoc(doc(sameEmailNoClaim(), 'users/alice')));
    await assertFails(getDoc(doc(unverifiedAdmin(), 'users/alice')));
    await assertFails(getDocs(collection(player(), 'users')));
    await assertSucceeds(getDoc(doc(player(), 'users/alice'))); // 본인은 그대로
  });

  it('통계: 관리자는 모든 사람의 경기를 묶어 센다(count) — 일반 이용자는 못 한다', async () => {
    const snapshot = await assertSucceeds(getCountFromServer(collectionGroup(admin(), 'games')));
    expect(snapshot.data().count).toBe(4);
    await assertFails(getCountFromServer(collectionGroup(player(), 'games')));
  });

  it('관리자 기록: 만들기만, 작성자·서버 시각 강제, 고치기·지우기 불가', async () => {
    const log = (db: Firestore, overrides: object = {}) =>
      setDoc(doc(db, 'adminLogs/l1'), { by: 'boss', action: 'view-email', target: 'alice', detail: '', at: now(), ...overrides });
    await assertFails(log(admin(), { by: 'someone-else' }));
    await assertFails(log(admin(), { at: Timestamp.fromMillis(0) }));
    await assertFails(log(player(), { by: 'alice' }));
    await assertSucceeds(log(admin()));
    await assertFails(updateDoc(doc(admin(), 'adminLogs/l1'), { detail: '고침' }));
    await assertFails(deleteDoc(doc(admin(), 'adminLogs/l1')));
  });

  it('작업 대기열: 관리자는 요청만, 상태를 "완료"로 바꾸는 건 서버 권한(운영자 PC)만', async () => {
    const task = (db: Firestore, status = 'pending') =>
      setDoc(doc(db, 'adminTasks/t1'), { type: 'deleteAuthUser', target: 'alice', status, requestedAt: now() });
    await assertFails(task(admin(), 'done'));
    await assertFails(task(player()));
    await assertSucceeds(task(admin()));
    await assertFails(updateDoc(doc(admin(), 'adminTasks/t1'), { status: 'done' }));
  });

  it('공개 문서(공지·이벤트·광고 묶음)는 누구나 읽고 관리자만 쓴다', async () => {
    const anonymous = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertSucceeds(getDoc(doc(anonymous, 'public/home')));
    await assertFails(setDoc(doc(player(), 'public/home'), { notices: ['가짜 공지'] }));
    await assertSucceeds(setDoc(doc(admin(), 'public/home'), { notices: ['점검 안내'] }));
  });

  it('계정 삭제: 관리자는 다른 사람의 기록을 지울 수 있다(일반 이용자는 못 함)', async () => {
    await assertFails(deleteDoc(doc(as('bob', { email_verified: true }), 'users/alice/games/g1')));
    await assertSucceeds(deleteDoc(doc(admin(), 'users/alice/games/g1')));
    await assertSucceeds(deleteDoc(doc(admin(), 'users/alice')));
  });
});
