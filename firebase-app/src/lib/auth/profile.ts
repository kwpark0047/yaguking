import { deleteUser, type User } from 'firebase/auth';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
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
    return {
      status: 'ready',
      ageConfirmed: snapshot.get('ageConfirmedAt') != null,
      data: {
        nickname: typeof nickname === 'string' ? nickname : null,
        favoriteTeams: strings(snapshot.get('favoriteTeams')),
        favoritePlayers: strings(snapshot.get('favoritePlayers')),
        levelTestDone: snapshot.get('levelTest') != null,
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
 * 만 14세 미만이라고 답했을 때: 프로필과 계정을 지운다(되돌릴 수 없다).
 * 계정 삭제는 최근 로그인이 필요하다 — 가입 직후라 보통 문제없다.
 */
export async function deleteOwnAccount(user: User): Promise<void> {
  await deleteDoc(doc(firestore(), 'users', user.uid)).catch(() => {
    // 프로필이 아직 없을 수 있다(확인 전). 계정 삭제는 그대로 진행한다.
  });
  await deleteUser(user);
}
