import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  documentId,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { emulatorHost, now, startRulesEnv } from './setup';

/**
 * 관리자 1차(골격·공지·가입자 보기) — **배포 규칙**(firestore.rules). docs/admin-plan.md
 * 관리자 = admin 표시 + 이메일 인증 + 구글로 로그인한 세션. 1차는 읽기만(삭제는 다음 단계).
 */
describe.skipIf(!emulatorHost)('관리자 규칙(배포 규칙)', () => {
  let env: RulesTestEnvironment;

  const as = (uid: string, token: Record<string, unknown>, provider: string = 'google.com'): Firestore =>
    env.authenticatedContext(uid, { ...token, firebase: { sign_in_provider: provider as never } }).firestore() as unknown as Firestore;
  const admin = () => as('boss', { admin: true, email_verified: true, email: 'kwpark0047@gmail.com' });
  const adminByPassword = () => as('boss', { admin: true, email_verified: true }, 'password');
  const sameEmailNoClaim = () => as('boss2', { email_verified: true, email: 'kwpark0047@gmail.com' });
  const unverifiedAdmin = () => as('boss3', { admin: true, email_verified: false });
  const player = () => as('alice', { email_verified: true }, 'password');

  beforeAll(async () => {
    env = await startRulesEnv('admin-prod');
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      for (const uid of ['alice', 'bob']) {
        await setDoc(doc(db, `users/${uid}`), { ageConfirmedAt: Timestamp.now(), createdAt: Timestamp.now(), nickname: uid });
        await setDoc(doc(db, `users/${uid}/summary/main`), { games: 2 });
        await setDoc(doc(db, `users/${uid}/wrongNotes/q0123456789ab`), { stage: 0 });
        for (const id of ['g1', 'g2']) await setDoc(doc(db, `users/${uid}/games/${id}`), { runs: 1, createdAt: Timestamp.now() });
        await setDoc(doc(db, `nicknames/${uid}`), { uid });
      }
      await setDoc(doc(db, 'accountMirror/alice'), { email: 'alice@example.test' });
      await setDoc(doc(db, 'adminStats/accounts'), { guests: 3 });
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });

  describe('누가 관리자인가', () => {
    it('표시 + 이메일 인증 + 구글 로그인이면 다른 회원의 프로필·기록을 읽는다', async () => {
      const db = admin();
      await assertSucceeds(getDoc(doc(db, 'users/alice')));
      await assertSucceeds(getDocs(collection(db, 'users')));
      await assertSucceeds(getDoc(doc(db, 'users/alice/summary/main')));
      await assertSucceeds(getDocs(collection(db, 'users/alice/games')));
      await assertSucceeds(getCountFromServer(collection(db, 'users/alice/wrongNotes')));
    });

    it('비밀번호로 로그인했거나, 이메일만 같거나, 이메일 미인증이면 관리자가 아니다', async () => {
      for (const db of [adminByPassword(), sameEmailNoClaim(), unverifiedAdmin()]) {
        await assertFails(getDoc(doc(db, 'users/alice')));
        await assertFails(getDocs(collection(db, 'users')));
      }
    });

    it('일반 회원은 그대로: 자기 것만, 목록 불가', async () => {
      await assertSucceeds(getDoc(doc(player(), 'users/alice')));
      await assertFails(getDoc(doc(player(), 'users/bob')));
      await assertFails(getDocs(collection(player(), 'users')));
    });
  });

  describe('1차는 읽기만', () => {
    it('관리자도 다른 회원의 기록을 고치거나 지울 수 없다(삭제는 다음 단계)', async () => {
      await assertFails(updateDoc(doc(admin(), 'users/alice'), { nickname: '바꿈', updatedAt: now() }));
      await assertFails(deleteDoc(doc(admin(), 'users/alice/games/g1')));
      await assertFails(deleteDoc(doc(admin(), 'users/alice')));
    });
  });

  describe('통계·검색', () => {
    it('경기 묶음 세기는 관리자만', async () => {
      const snapshot = await assertSucceeds(getCountFromServer(collectionGroup(admin(), 'games')));
      expect(snapshot.data().count).toBe(4);
      await assertFails(getCountFromServer(collectionGroup(player(), 'games')));
    });

    it('닉네임: 하나씩 확인은 누구나(로그인), 앞글자 검색·목록은 관리자만', async () => {
      await assertSucceeds(getDoc(doc(player(), 'nicknames/bob')));
      await assertFails(getDocs(collection(player(), 'nicknames')));
      const prefix = query(collection(admin(), 'nicknames'), where(documentId(), '>=', 'a'), where(documentId(), '<', 'b'));
      await assertSucceeds(getDocs(prefix));
    });
  });

  describe('관리자 전용 문서', () => {
    it('계정 사본·계정 통계: 관리자만 읽고, 아무도 쓰지 못한다(운영자 PC만)', async () => {
      await assertSucceeds(getDoc(doc(admin(), 'accountMirror/alice')));
      await assertSucceeds(getDoc(doc(admin(), 'adminStats/accounts')));
      await assertFails(getDoc(doc(player(), 'accountMirror/alice')));
      await assertFails(setDoc(doc(admin(), 'accountMirror/alice'), { email: 'x' }));
      await assertFails(setDoc(doc(admin(), 'adminStats/accounts'), { guests: 0 }));
    });

    it('관리자 기록: 만들기만, 작성자·서버 시각 강제', async () => {
      const log = (db: Firestore, overrides: object = {}) =>
        setDoc(doc(db, 'adminLogs/l1'), { by: 'boss', action: 'view-email', target: 'alice', detail: '', at: now(), ...overrides });
      await assertFails(log(admin(), { by: 'someone' }));
      await assertFails(log(admin(), { at: Timestamp.fromMillis(0) }));
      await assertFails(log(admin(), { extra: 1 }));
      await assertFails(log(player(), { by: 'alice' }));
      await assertSucceeds(log(admin()));
      await assertFails(updateDoc(doc(admin(), 'adminLogs/l1'), { detail: '고침' }));
      await assertFails(deleteDoc(doc(admin(), 'adminLogs/l1')));
    });

    it('화면 보기(adminViews): 관리자만 읽고 쓴다, 정해진 이름·JSON 한 덩어리·작성자·서버 시각만', async () => {
      const view = (db: Firestore, id = 'dashboard', overrides: object = {}) =>
        setDoc(doc(db, `adminViews/${id}`), { json: '{}', by: 'boss', updatedAt: now(), ...overrides });
      await assertSucceeds(view(admin()));
      await assertSucceeds(getDoc(doc(admin(), 'adminViews/dashboard')));
      await assertFails(getDoc(doc(player(), 'adminViews/dashboard')));
      await assertFails(view(player(), 'dashboard', { by: 'alice' }));
      await assertFails(view(admin(), 'secrets'));
      await assertFails(view(admin(), 'members', { by: 'someone' }));
      await assertFails(view(admin(), 'members', { updatedAt: Timestamp.fromMillis(0) }));
      await assertFails(view(admin(), 'members', { json: 1 }));
      await assertFails(view(admin(), 'members', { extra: true }));
      await assertFails(deleteDoc(doc(admin(), 'adminViews/dashboard')));
    });

    it('하루 통계 요약(adminDaily): 관리자만 읽고, 아무도 쓰지 못한다(운영자 PC만)', async () => {
      await env.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'adminDaily/20261027'), { games: 3 });
      });
      await assertSucceeds(getDoc(doc(admin(), 'adminDaily/20261027')));
      await assertFails(getDoc(doc(player(), 'adminDaily/20261027')));
      await assertFails(setDoc(doc(admin(), 'adminDaily/20261028'), { games: 1 }));
    });

    it('대결 방: 관리자는 목록·자리 목록을 읽고 지난 방을 지운다, 일반 회원은 남의 방을 못 지운다', async () => {
      await env.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'rooms/OLD234'), { hostUid: 'bob', status: 'finished', playerIds: ['bob'], questionIds: [] });
        await setDoc(doc(db, 'rooms/OLD234/players/bob'), { nickname: '밥', score: 0, answers: [] });
      });
      await assertSucceeds(getDocs(collection(admin(), 'rooms')));
      await assertSucceeds(getDocs(collection(admin(), 'rooms/OLD234/players')));
      await assertFails(deleteDoc(doc(player(), 'rooms/OLD234')));
      await assertSucceeds(deleteDoc(doc(admin(), 'rooms/OLD234/players/bob')));
      await assertSucceeds(deleteDoc(doc(admin(), 'rooms/OLD234')));
    });

    it('작업 대기열: 계정 동기화 요청만, "대기"로만, 완료 표시는 운영자 PC만', async () => {
      const task = (db: Firestore, overrides: object = {}) =>
        setDoc(doc(db, 'adminTasks/t1'), { type: 'syncAccounts', target: '', status: 'pending', by: 'boss', requestedAt: now(), ...overrides });
      await assertFails(task(admin(), { type: 'deleteAuthUser' })); // 1차에는 없는 작업
      await assertFails(task(admin(), { status: 'done' }));
      await assertFails(task(player(), { by: 'alice' }));
      await assertSucceeds(task(admin()));
      await assertFails(updateDoc(doc(admin(), 'adminTasks/t1'), { status: 'done' }));
    });
  });

  describe('공지사항', () => {
    const notice = (overrides: object = {}) => ({
      title: '점검 안내',
      body: '10월 28일 새벽 점검이 있어요.',
      startsAt: Timestamp.fromMillis(Date.now()),
      endsAt: null,
      pinned: true,
      hidden: false,
      createdAt: Timestamp.fromMillis(Date.now()),
      updatedAt: now(),
      by: 'boss',
      ...overrides,
    });

    it('관리자는 쓰고, 모양이 틀리면 거절, 일반 이용자는 원본을 읽지도 못한다', async () => {
      await assertSucceeds(setDoc(doc(admin(), 'notices/n1'), notice()));
      await assertFails(setDoc(doc(admin(), 'notices/n2'), notice({ title: '' })));
      await assertFails(setDoc(doc(admin(), 'notices/n2'), notice({ title: '가'.repeat(81) })));
      await assertFails(setDoc(doc(admin(), 'notices/n2'), notice({ endsAt: Timestamp.fromMillis(0) })));
      await assertFails(setDoc(doc(admin(), 'notices/n2'), notice({ by: 'someone' })));
      await assertFails(setDoc(doc(player(), 'notices/n3'), notice({ by: 'alice' })));
      await assertFails(getDoc(doc(player(), 'notices/n1')));
    });

    it('공개 묶음(public/home): 누구나(로그인 안 해도) 읽고, 관리자만 정해진 모양으로 쓴다', async () => {
      const anonymous = env.unauthenticatedContext().firestore() as unknown as Firestore;
      await assertSucceeds(setDoc(doc(admin(), 'public/home'), { notices: [{ id: 'n1', title: '점검' }], updatedAt: now() }));
      await assertSucceeds(getDoc(doc(anonymous, 'public/home')));
      await assertFails(setDoc(doc(player(), 'public/home'), { notices: [], updatedAt: now() }));
      await assertFails(setDoc(doc(admin(), 'public/home'), { notices: Array.from({ length: 21 }, (_, i) => ({ id: `n${i}` })), updatedAt: now() }));
      // 광고 칸(ads)은 이제 받는다(docs/ads-plan.md) — 정해지지 않은 칸은 여전히 거절
      await assertSucceeds(setDoc(doc(admin(), 'public/home'), { notices: [], ads: [], updatedAt: now() }));
      await assertFails(setDoc(doc(admin(), 'public/home'), { notices: [], tracker: 'x', updatedAt: now() }));
      await assertFails(setDoc(doc(admin(), 'public/other'), { notices: [], updatedAt: now() }));
    });
  });
});
