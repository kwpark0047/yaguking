/**
 * 관리자 운영 작업 — 운영자 PC에서 Admin SDK로(docs/admin-plan.md §2·§6). 규칙을 건너뛰므로 여기 코드가 곧 서버 규칙이다.
 *
 * - setAdmin: 계정에 관리자 표시(custom claim `admin`)를 붙이거나 뗀다. 관리자 화면은 이 표시를 만들 수 없다
 * - syncAccounts: 로그인 계정 목록 → `accountMirror/{uid}`(회원만, 바뀐 것만 쓰기) + `adminStats/accounts`(비회원은 개수만)
 * - processAdminTasks: 관리자 화면이 남긴 `adminTasks` 중 대기 중인 것을 처리하고 결과를 적는다
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const DAY = 86_400_000;

/** 회원(이메일·구글) — 로그인 수단이 하나라도 있다. 비회원(익명)은 수단이 없다 */
export const isMemberAccount = (user) => (user.providerData ?? []).length > 0 || Boolean(user.email);

const time = (value) => (value ? Date.parse(value) : 0);

/** 계정 사본 한 장(비교·저장용). 동기화 시각은 넣지 않는다 — 넣으면 매번 "바뀜"이 된다 */
export function mirrorOf(user) {
  return {
    email: user.email ?? null,
    emailVerified: Boolean(user.emailVerified),
    providers: (user.providerData ?? []).map((provider) => provider.providerId).sort(),
    disabled: Boolean(user.disabled),
    createdAt: time(user.metadata?.creationTime),
    lastSignInAt: Math.max(time(user.metadata?.lastSignInTime), time(user.metadata?.lastRefreshTime)),
    admin: user.customClaims?.admin === true,
  };
}

const toFirestore = (mirror) => ({
  ...mirror,
  createdAt: Timestamp.fromMillis(mirror.createdAt),
  lastSignInAt: Timestamp.fromMillis(mirror.lastSignInAt),
});

const fromFirestore = (data) => ({
  email: data.email ?? null,
  emailVerified: Boolean(data.emailVerified),
  providers: [...(data.providers ?? [])].sort(),
  disabled: Boolean(data.disabled),
  createdAt: data.createdAt?.toMillis?.() ?? 0,
  lastSignInAt: data.lastSignInAt?.toMillis?.() ?? 0,
  admin: Boolean(data.admin),
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 이메일로 계정을 찾아 관리자 표시를 붙이거나 뗀다. 다른 표시는 그대로 둔다 */
export async function setAdmin({ auth, email, value = true }) {
  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims ?? {}) };
  if (value) claims.admin = true;
  else delete claims.admin;
  await auth.setCustomUserClaims(user.uid, claims);
  return { uid: user.uid, admin: value, emailVerified: user.emailVerified, providers: user.providerData.map((p) => p.providerId) };
}

export async function syncAccounts({ auth, db, now = Date.now() }) {
  const report = { members: 0, guests: 0, guestsActive7d: 0, written: 0, removed: 0 };
  const existing = new Map();
  for (const snapshot of (await db.collection('accountMirror').get()).docs) existing.set(snapshot.id, fromFirestore(snapshot.data()));

  const seen = new Set();
  const writer = db.bulkWriter();
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (!isMemberAccount(user)) {
        report.guests += 1;
        if (mirrorOf(user).lastSignInAt >= now - 7 * DAY) report.guestsActive7d += 1;
        continue;
      }
      report.members += 1;
      seen.add(user.uid);
      const mirror = mirrorOf(user);
      if (!existing.has(user.uid) || !same(existing.get(user.uid), mirror)) {
        writer.set(db.doc(`accountMirror/${user.uid}`), { ...toFirestore(mirror), syncedAt: FieldValue.serverTimestamp() });
        report.written += 1;
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  // 지워진 계정의 사본은 지운다(사본만 남는 일이 없게)
  for (const uid of existing.keys()) {
    if (!seen.has(uid)) {
      writer.delete(db.doc(`accountMirror/${uid}`));
      report.removed += 1;
    }
  }
  writer.set(db.doc('adminStats/accounts'), {
    members: report.members,
    guests: report.guests,
    guestsActive7d: report.guestsActive7d,
    syncedAt: FieldValue.serverTimestamp(),
  });
  await writer.close();
  return report;
}

/** 대기 중인 관리자 작업 처리. 같은 종류가 여럿이면 한 번만 돌리고 모두 완료로 적는다 */
export async function processAdminTasks({ auth, db, now = Date.now() }) {
  const pending = await db.collection('adminTasks').where('status', '==', 'pending').get();
  const results = {};
  for (const task of pending.docs) {
    const type = task.get('type');
    try {
      if (type === 'syncAccounts') results.syncAccounts ??= await syncAccounts({ auth, db, now });
      else throw new Error(`모르는 작업: ${type}`);
      await task.ref.update({ status: 'done', result: JSON.stringify(results[type]), doneAt: FieldValue.serverTimestamp() });
    } catch (error) {
      await task.ref.update({ status: 'failed', result: String(error?.message ?? error), doneAt: FieldValue.serverTimestamp() });
    }
  }
  return { processed: pending.size, results };
}
