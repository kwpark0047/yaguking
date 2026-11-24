import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { processAdminTasks } from '../../ops/admin.mjs';

/** 관리자 화면이 남긴 가입자 관리 작업(계정 삭제·초대 보상 취소)을 운영자 PC가 처리 — 에뮬레이터에서 실제로. `npm run test:ops` */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const PROJECT = 'demo-yaguking';

describe.skipIf(!emulated)('가입자 관리 작업(에뮬레이터)', () => {
  let app: App;
  let db: Firestore;
  let auth: Auth;

  beforeAll(async () => {
    app = initializeApp({ projectId: PROJECT }, 'admin-tasks-test');
    db = getFirestore(app);
    auth = getAuth(app);
    await db.doc('warmup/x').get();
  }, 60_000);
  afterAll(async () => {
    await deleteApp(app);
  });
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  });

  const task = (id: string, type: string, target: string, detail: string) =>
    db.doc(`adminTasks/${id}`).set({ type, target, detail, status: 'pending', by: 'boss123', requestedAt: Timestamp.now() });

  it('계정 삭제: 기록·팀 자리·닉네임 예약·초대 코드·로그인 계정을 지우고 관리자 기록을 남긴다', async () => {
    await auth.createUser({ uid: 'alice', email: 'alice@example.test', password: 'pw-123456' });
    await db.doc('users/alice').set({ ageConfirmedAt: Timestamp.now(), nickname: 'Alice', inviteCode: 'ALXCE2', squad: 'TEAMA2' });
    await db.doc('users/alice/games/g1').set({ runs: 1 });
    await db.doc('users/alice/wallet/main').set({ earned: 50, spent: 0 });
    await db.doc('nicknames/alice').set({ uid: 'alice' });
    await db.doc('invites/ALXCE2').set({ uid: 'alice' });
    await db.doc('squads/TEAMA2/members/alice').set({ nickname: 'Alice', child: false });
    await task('t1', 'deleteAccount', 'alice', '본인 요청');

    const report = await processAdminTasks({ auth, db });
    expect(report).toMatchObject({ processed: 1, results: { deleteAccount: 1 } });
    const done = (await db.doc('adminTasks/t1').get()).data()!;
    expect(done.status).toBe('done');
    for (const path of ['users/alice', 'users/alice/games/g1', 'users/alice/wallet/main', 'nicknames/alice', 'invites/ALXCE2', 'squads/TEAMA2/members/alice']) {
      expect((await db.doc(path).get()).exists, path).toBe(false);
    }
    await expect(auth.getUser('alice')).rejects.toBeTruthy();
    const logs = await db.collection('adminLogs').where('action', '==', 'delete-account').get();
    expect(logs.docs[0]?.get('detail')).toContain('본인 요청');
    expect(logs.docs[0]?.get('by')).toBe('ops:boss12');
  });

  it('계정 삭제: 목록에 없는 사유·관리자 계정은 처리하지 않고 실패로 적는다', async () => {
    await auth.createUser({ uid: 'boss', email: 'boss@example.test' });
    await auth.setCustomUserClaims('boss', { admin: true });
    await db.doc('users/boss').set({ nickname: '관리자' });
    await db.doc('users/bob').set({ nickname: 'Bob' });
    await task('t1', 'deleteAccount', 'boss', '본인 요청');
    await task('t2', 'deleteAccount', 'bob', '약관 위반');
    await processAdminTasks({ auth, db });
    expect((await db.doc('adminTasks/t1').get()).get('status')).toBe('failed');
    expect((await db.doc('adminTasks/t2').get()).get('status')).toBe('failed');
    expect((await db.doc('users/boss').get()).exists).toBe(true);
    expect((await db.doc('users/bob').get()).exists).toBe(true);
  });

  it('초대 보상 취소: 진행 기록을 취소로, 관리자 기록', async () => {
    await db.doc('inviteLedger/bob').set({ inviter: 'alice', invitee: 'bob', status: 'rewarded', inviterPoints: 100, inviteePoints: 50 });
    await task('t1', 'revokeInvite', 'bob', '부정 초대 의심');
    const report = await processAdminTasks({ auth, db });
    expect(report.results).toMatchObject({ revokeInvite: 1 });
    expect((await db.doc('inviteLedger/bob').get()).data()).toMatchObject({ status: 'revoked', inviterPoints: 0, inviteePoints: 0 });
    expect((await db.doc('adminTasks/t1').get()).get('status')).toBe('done');
  });
});
