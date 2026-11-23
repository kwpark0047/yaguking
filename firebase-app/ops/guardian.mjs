/**
 * 만 14세 미만 자녀 계정의 보호자 메일 동의 — 운영자 PC(src/lib/auth/guardian.ts).
 *
 * - `admin-cli guardians`: 동의를 기다리는 자녀 계정(동의 코드·보호자 메일 주소·신청일) 목록
 * - `admin-cli guardian-approve --code=XXXXXX --email=보낸주소`: 받은 동의 메일의 **보낸 주소**가 자녀가 적은 보호자 주소와 같을 때만
 *   동의를 기록한다(users/{uid}.guardianConsentAt·guardianConsentVersion, private/guardian.consentedAt). 관리자 기록이 남는다.
 *   승인한 뒤 운영자가 보호자에게 확인 메일로 답한다
 * - 0시 작업(`admin-cli guardians-expire`): 7일 안에 동의가 없는 계정과 보호자 메일 주소를 지운다(계정·기록·로그인 모두)
 *
 * 값은 src/lib/auth/guardian.ts와 같아야 한다(단위 테스트). `now`는 테스트용.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const GUARDIAN_WAIT_DAYS = 7;
export const GUARDIAN_VERSION = '2026-12-15';

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const ms = (value) => (value && typeof value.toMillis === 'function' ? value.toMillis() : 0);

/** 동의를 기다리는 자녀 계정 — under14At은 있고 guardianConsentAt은 없는 프로필 */
export async function listGuardians({ db }) {
  const snapshot = await db.collection('users').where('under14At', '!=', null).get();
  const pending = snapshot.docs.filter((item) => item.get('guardianConsentAt') == null);
  const rows = [];
  for (const user of pending) {
    const guardian = await user.ref.collection('private').doc('guardian').get();
    rows.push({
      uid: user.id,
      code: guardian.get('code') ?? null,
      email: guardian.get('email') ?? null,
      requestedAt: ms(user.get('under14At')),
    });
  }
  return rows.sort((a, b) => a.requestedAt - b.requestedAt);
}

export async function approveGuardian({ db, code, email, now = Date.now(), by = 'ops' }) {
  const wanted = String(code ?? '').trim().toUpperCase();
  const rows = (await listGuardians({ db })).filter((row) => row.code === wanted);
  if (rows.length === 0) return { approved: false, reason: '이 동의 코드로 기다리는 계정이 없어요(이미 승인했거나 기한이 지났을 수 있어요)' };
  const row = rows[0];
  if (normalize(row.email) !== normalize(email)) {
    return { approved: false, reason: '보낸 주소가 자녀가 적은 보호자 메일 주소와 달라요 — 승인하지 않았어요' };
  }
  if (now - row.requestedAt > GUARDIAN_WAIT_DAYS * 86_400_000) return { approved: false, reason: '기한(7일)이 지났어요 — 자녀가 다시 신청해야 해요' };
  const batch = db.batch();
  batch.update(db.doc(`users/${row.uid}`), { guardianConsentAt: Timestamp.fromMillis(now), guardianConsentVersion: GUARDIAN_VERSION });
  batch.update(db.doc(`users/${row.uid}/private/guardian`), { consentedAt: Timestamp.fromMillis(now) });
  batch.set(db.collection('adminLogs').doc(), {
    by,
    action: 'guardian-approve',
    target: row.uid,
    detail: `동의 코드 ${wanted}`,
    at: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { approved: true, uid: row.uid };
}

/** 0시 — 기한이 지난 신청의 계정·기록·로그인을 지운다 */
export async function expireGuardians({ db, auth, now = Date.now(), dryRun = false }) {
  const rows = await listGuardians({ db });
  const expired = rows.filter((row) => now - row.requestedAt > GUARDIAN_WAIT_DAYS * 86_400_000);
  if (dryRun) return { pending: rows.length, expired: expired.length, deleted: 0 };
  let deleted = 0;
  for (const row of expired) {
    await db.recursiveDelete(db.doc(`users/${row.uid}`));
    try {
      await auth.deleteUser(row.uid);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
    await db.collection('adminLogs').add({
      by: 'ops',
      action: 'guardian-expire',
      target: row.uid,
      detail: `${GUARDIAN_WAIT_DAYS}일 안에 보호자 동의 없음 — 계정 삭제`,
      at: FieldValue.serverTimestamp(),
    });
    deleted += 1;
  }
  return { pending: rows.length - deleted, expired: expired.length, deleted };
}
