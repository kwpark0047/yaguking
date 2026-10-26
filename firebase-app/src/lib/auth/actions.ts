import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  linkWithPopup,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase/auth';

/**
 * 로그인 방법 — 이메일·비밀번호, 구글, 익명(비회원).
 *
 * 이메일 링크 로그인은 쓰지 않는다. Spark 플랜은 하루 5통만 보낸다.
 *
 * **비회원 → 가입은 "연결"이다.** 익명 계정에 이메일·구글을 붙이면 uid가 그대로라
 * 비회원으로 쌓은 기록이 자동으로 회원 기록이 된다. 기존 앱의 "기록 승계"를 서버
 * 없이 대신한다. 이미 있는 계정으로 **로그인**하면 그 계정으로 바뀌므로, 비회원
 * 기록은 따라가지 않는다(화면이 미리 알린다).
 */

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  const auth = firebaseAuth();
  const current = auth.currentUser;
  if (current?.isAnonymous) {
    await linkWithCredential(current, EmailAuthProvider.credential(email, password));
    return;
  }
  await createUserWithEmailAndPassword(auth, email, password);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(firebaseAuth(), email, password);
}

/**
 * 구글로 계속하기. 비회원이면 먼저 연결을 시도하고, 그 구글 계정이 이미 다른
 * 회원이면 그 회원으로 로그인한다(비회원 기록은 따라가지 않는다).
 */
export async function continueWithGoogle(): Promise<{ linkedGuest: boolean }> {
  const auth = firebaseAuth();
  const provider = new GoogleAuthProvider();
  const current = auth.currentUser;

  if (current?.isAnonymous) {
    try {
      await linkWithPopup(current, provider);
      return { linkedGuest: true };
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== 'auth/credential-already-in-use') throw error;
      const credential = GoogleAuthProvider.credentialFromError(error as never);
      if (!credential) throw error;
      const { signInWithCredential } = await import('firebase/auth');
      await signInWithCredential(auth, credential);
      return { linkedGuest: false };
    }
  }

  await signInWithPopup(auth, provider);
  return { linkedGuest: false };
}

export async function startAsGuest(): Promise<void> {
  const auth = firebaseAuth();
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}

export async function signOutUser(): Promise<void> {
  await signOut(firebaseAuth());
}

/** 비밀번호 재설정 메일. Spark 플랜은 하루 150통이다. */
export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth(), email);
}
