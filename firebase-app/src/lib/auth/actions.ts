import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type AuthError,
} from 'firebase/auth';
import { firebaseAuth } from '@/lib/firebase/auth';
import { isStandalone } from '@/lib/pwa/install';

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

/** 비회원 연결 중 "이미 다른 회원의 구글 계정"이면 그 회원으로 로그인한다(비회원 기록은 따라가지 않는다) */
async function signInInsteadOfLink(error: unknown): Promise<{ linkedGuest: boolean }> {
  if ((error as { code?: string }).code !== 'auth/credential-already-in-use') throw error;
  const credential = GoogleAuthProvider.credentialFromError(error as AuthError);
  if (!credential) throw error;
  await signInWithCredential(firebaseAuth(), credential);
  return { linkedGuest: false };
}

/**
 * 구글로 계속하기. 비회원이면 먼저 연결을 시도하고, 그 구글 계정이 이미 다른
 * 회원이면 그 회원으로 로그인한다(비회원 기록은 따라가지 않는다).
 *
 * 홈 화면 앱(PWA)으로 열었으면 팝업 대신 **이동 방식**(redirect)으로 한다 — 홈 화면 앱의 팝업은 다른 브라우저 창에서 열려
 * 로그인 상태를 넘겨받지 못한다. 이동 방식은 이 페이지를 떠났다가 돌아오며, 결과는 completeGoogleRedirect()가 받는다.
 */
export async function continueWithGoogle(): Promise<{ linkedGuest: boolean }> {
  const auth = firebaseAuth();
  const provider = new GoogleAuthProvider();
  const current = auth.currentUser;

  if (isStandalone()) {
    if (current?.isAnonymous) await linkWithRedirect(current, provider);
    else await signInWithRedirect(auth, provider);
    return new Promise(() => {}); // 구글로 넘어간다 — 돌아오면 completeGoogleRedirect
  }

  if (current?.isAnonymous) {
    try {
      await linkWithPopup(current, provider);
      return { linkedGuest: true };
    } catch (error) {
      return signInInsteadOfLink(error);
    }
  }

  await signInWithPopup(auth, provider);
  return { linkedGuest: false };
}

/**
 * 이동 방식 구글 로그인에서 돌아왔을 때의 결과 — 이동한 적이 없으면 null.
 * 결과는 한 번만 받을 수 있어(두 번째는 null) 페이지를 여는 동안 한 번 읽은 것을 함께 쓴다(화면이 두 번 그려져도 같은 결과).
 */
let redirectResult: Promise<{ linkedGuest: boolean } | null> | null = null;
export function completeGoogleRedirect(): Promise<{ linkedGuest: boolean } | null> {
  redirectResult ??= getRedirectResult(firebaseAuth()).then(
    (result) => (result ? { linkedGuest: result.operationType === 'link' } : null),
    signInInsteadOfLink,
  );
  return redirectResult;
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
