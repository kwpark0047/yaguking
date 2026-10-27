import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isMemberAccount, processAdminTasks, setAdmin, syncAccounts } from '../../ops/admin.mjs';

/** 관리자 운영 작업(ops/admin.mjs) — Auth·Firestore 에뮬레이터에서 실제로. `npm run test:ops` */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const PROJECT = 'demo-yaguking';

describe('회원 계정 구분', () => {
  it('로그인 수단이나 이메일이 있으면 회원, 없으면 비회원', () => {
    expect(isMemberAccount({ providerData: [], email: undefined })).toBe(false);
    expect(isMemberAccount({ providerData: [{ providerId: 'google.com' }] as never, email: undefined })).toBe(true);
  });
});

describe.skipIf(!emulated)('관리자 운영 작업(에뮬레이터)', () => {
  let app: App;
  let auth: Auth;
  let db: Firestore;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, 'admin-ops-test');
    auth = getAuth(app);
    db = getFirestore(app);
  });
  afterAll(async () => {
    await deleteApp(app);
  });
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  });

  it('관리자 표시를 붙이고 떼며, 다른 표시는 지우지 않는다', async () => {
    const { uid } = await auth.createUser({ email: 'boss@example.test', emailVerified: true });
    await auth.setCustomUserClaims(uid, { team: 'lg' });
    await setAdmin({ auth, email: 'boss@example.test' });
    expect((await auth.getUser(uid)).customClaims).toEqual({ team: 'lg', admin: true });
    await setAdmin({ auth, email: 'boss@example.test', value: false });
    expect((await auth.getUser(uid)).customClaims).toEqual({ team: 'lg' });
  });

  it('계정 동기화: 회원만 사본, 비회원은 개수만, 바뀐 것만 쓰고 지워진 계정의 사본은 지운다', async () => {
    const member = await auth.createUser({ email: 'm1@example.test', password: 'yaguking-123' });
    const other = await auth.createUser({ email: 'm2@example.test', password: 'yaguking-123' });
    await auth.createUser({}); // 비회원 둘
    await auth.createUser({});

    const first = await syncAccounts({ auth, db });
    expect(first).toMatchObject({ members: 2, guests: 2, guestsActive7d: 2, written: 2, removed: 0 });
    const mirror = (await db.doc(`accountMirror/${member.uid}`).get()).data()!;
    expect(mirror).toMatchObject({ email: 'm1@example.test', emailVerified: false, providers: ['password'], admin: false });
    expect((await db.doc('adminStats/accounts').get()).data()).toMatchObject({ members: 2, guests: 2 });

    // 아무것도 안 바뀌면 사본을 다시 쓰지 않는다(무료 쓰기 한도)
    expect((await syncAccounts({ auth, db })).written).toBe(0);

    // 바뀐 계정만, 지워진 계정은 사본 삭제
    await auth.updateUser(member.uid, { emailVerified: true });
    await auth.deleteUser(other.uid);
    const third = await syncAccounts({ auth, db });
    expect(third).toMatchObject({ members: 1, written: 1, removed: 1 });
    expect((await db.doc(`accountMirror/${other.uid}`).get()).exists).toBe(false);
    expect((await db.doc(`accountMirror/${member.uid}`).get()).get('emailVerified')).toBe(true);
  });

  it('작업 대기열: 대기 중인 동기화 요청을 한 번만 돌리고 모두 완료로, 모르는 작업은 실패로', async () => {
    await auth.createUser({ email: 'm1@example.test' });
    await db.doc('adminTasks/a').set({ type: 'syncAccounts', status: 'pending', target: '', by: 'boss' });
    await db.doc('adminTasks/b').set({ type: 'syncAccounts', status: 'pending', target: '', by: 'boss' });
    await db.doc('adminTasks/c').set({ type: 'formatDisk', status: 'pending', target: '', by: 'boss' });
    await db.doc('adminTasks/d').set({ type: 'syncAccounts', status: 'done', target: '', by: 'boss' });

    const report = await processAdminTasks({ auth, db });
    expect(report.processed).toBe(3);
    expect((await db.doc('adminTasks/a').get()).get('status')).toBe('done');
    expect((await db.doc('adminTasks/b').get()).get('status')).toBe('done');
    expect((await db.doc('adminTasks/c').get()).get('status')).toBe('failed');
    expect((await db.doc('accountMirror/' + (await auth.getUserByEmail('m1@example.test')).uid).get()).exists).toBe(true);
  });
});
