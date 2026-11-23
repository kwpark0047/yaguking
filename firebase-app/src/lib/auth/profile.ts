import { deleteUser, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/db';
import { countReads, countWrites } from '@/lib/firebase/meter';
import type { ProfileState } from './gate';

/**
 * `users/{uid}` — 회원 프로필(만 14세 확인 시각, 닉네임, 최애 구단·선수, 레벨 테스트).
 *
 * 읽기는 한 번(getDoc)만 한다. 실시간 구독(onSnapshot)은 무료 읽기 한도를
 * 계속 쓰므로 프로필처럼 거의 안 바뀌는 문서에는 쓰지 않는다.
 */
export async function loadProfile(uid: string): Promise<ProfileState> {
  try {
    const snapshot = await getDoc(doc(firestore(), 'users', uid));
    countReads('loadProfile', 1);
    if (!snapshot.exists()) return { status: 'missing' };
    const strings = (value: unknown) =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    const nickname = snapshot.get('nickname');
    const consented = snapshot.get('guardianConsentAt') != null;
    const squad = snapshot.get('squad');
    const leftAt = snapshot.get('squadLeftAt');
    return {
      status: 'ready',
      ageConfirmed: snapshot.get('ageConfirmedAt') != null || consented,
      data: {
        nickname: typeof nickname === 'string' ? nickname : null,
        favoriteTeams: strings(snapshot.get('favoriteTeams')),
        favoritePlayers: strings(snapshot.get('favoritePlayers')),
        levelTestDone: snapshot.get('levelTest') != null,
        rankingHidden: snapshot.get('rankingHidden') === true,
        guardian: consented ? 'consented' : snapshot.get('under14At') != null ? 'pending' : 'none',
        squad: typeof squad === 'string' ? squad : null,
        squadLeftAt: leftAt && typeof leftAt.toMillis === 'function' ? leftAt.toMillis() : null,
      },
    };
  } catch {
    return { status: 'error' };
  }
}

/**
 * 만 14세 이상임을 기록한다. 시각은 **서버 시각**이고, 보안 규칙이
 * `request.time`과 같은지 확인한다 — 기기 시계로 지어낼 수 없다.
 *
 * 비회원에서 가입으로 바꾼 직후에는 토큰에 아직 '익명'이 남아 있을 수 있어
 * 새 토큰을 받고 쓴다(규칙이 익명 계정의 프로필 생성을 막는다).
 */
export async function confirmAge(user: User): Promise<void> {
  await user.getIdToken(true);
  await setDoc(doc(firestore(), 'users', user.uid), {
    ageConfirmedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
  countWrites('confirmAge', 1);
}

/**
 * 만 14세 미만 자녀가 보호자 동의를 신청한다(src/lib/auth/guardian.ts): 프로필(만 14세 미만 응답 시각)과
 * 보호자 메일 주소·동의 코드(users/{uid}/private/guardian — 본인과 운영자만)를 한 묶음으로. 동의는 운영자 PC만 기록한다.
 */
export async function requestGuardianConsent(user: User, guardianEmail: string): Promise<string> {
  const { makeSquadCode } = await import('@/lib/squad/squad');
  const { writeBatch } = await import('firebase/firestore');
  await user.getIdToken(true);
  const code = makeSquadCode();
  const batch = writeBatch(firestore());
  batch.set(doc(firestore(), 'users', user.uid), { under14At: serverTimestamp(), createdAt: serverTimestamp() });
  batch.set(doc(firestore(), 'users', user.uid, 'private', 'guardian'), { email: guardianEmail, code, requestedAt: serverTimestamp() });
  await batch.commit();
  countWrites('requestGuardianConsent', 2);
  return code;
}

/** 동의를 기다리는 자녀 계정의 동의 코드·보호자 메일 주소 */
export async function loadGuardianRequest(uid: string): Promise<{ email: string; code: string; requestedAt: number } | null> {
  const snapshot = await getDoc(doc(firestore(), 'users', uid, 'private', 'guardian'));
  countReads('loadGuardianRequest', 1);
  if (!snapshot.exists()) return null;
  const requested = snapshot.get('requestedAt');
  return {
    email: String(snapshot.get('email') ?? ''),
    code: String(snapshot.get('code') ?? ''),
    requestedAt: requested && typeof requested.toMillis === 'function' ? requested.toMillis() : Date.now(),
  };
}

/**
 * 만 14세 미만이라고 답했을 때: 기록과 계정을 지운다(되돌릴 수 없다). 비회원으로 쌓은 기록도
 * 같은 uid라 함께 지운다. 프로필은 아직 없을 수 있다(확인 전 — 없는 문서 삭제는 그냥 지나간다).
 * 계정 삭제는 최근 로그인이 필요하다 — 가입 직후라 보통 문제없다.
 */
export async function deleteOwnAccount(user: User): Promise<void> {
  // 이 파일은 회원이 앱을 열 때마다 불러온다. 지우기 코드는 드물게 쓰므로 그때 불러온다
  const { deleteUserRecords } = await import('@/lib/profile/save');
  await deleteUserRecords(user.uid, null);
  await deleteUser(user);
}
