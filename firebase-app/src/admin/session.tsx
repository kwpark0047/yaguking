import { GoogleAuthProvider, onIdTokenChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ADMIN_IDLE_MS, adminDenial, type AdminDenial } from '@/lib/admin/access';
import { firebaseAuth } from '@/lib/firebase/auth';

export type AdminSession =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'denied'; user: User; reason: AdminDenial }
  | { kind: 'admin'; user: User };

interface SessionValue {
  session: AdminSession;
  signIn: () => Promise<void>;
  signOutAdmin: () => Promise<void>;
  /** 관리자 표시를 붙인 뒤 토큰을 새로 받아 다시 판단한다 */
  recheck: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

async function evaluate(user: User | null, forceRefresh = false): Promise<AdminSession> {
  if (!user) return { kind: 'signed-out' };
  const token = await user.getIdTokenResult(forceRefresh);
  const reason = adminDenial(token.claims as never);
  return reason ? { kind: 'denied', user, reason } : { kind: 'admin', user };
}

/**
 * 관리자 로그인 상태. **구글 로그인만**(규칙도 구글 세션만 관리자로 본다).
 * 30분 동안 아무 입력이 없으면 로그아웃한다.
 */
export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession>({ kind: 'loading' });

  useEffect(
    () =>
      onIdTokenChanged(firebaseAuth(), (user) => {
        void evaluate(user).then(setSession);
      }),
    [],
  );

  const signOutAdmin = useCallback(() => signOut(firebaseAuth()), []);

  // 쉬는 시간 로그아웃
  useEffect(() => {
    if (session.kind !== 'admin') return;
    let timer = window.setTimeout(() => void signOutAdmin(), ADMIN_IDLE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void signOutAdmin(), ADMIN_IDLE_MS);
    };
    const events = ['pointerdown', 'keydown'] as const;
    for (const name of events) window.addEventListener(name, reset);
    return () => {
      window.clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, reset);
    };
  }, [session.kind, signOutAdmin]);

  const signIn = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(firebaseAuth(), provider);
  }, []);

  const recheck = useCallback(async () => {
    setSession(await evaluate(firebaseAuth().currentUser, true));
  }, []);

  return <SessionContext.Provider value={{ session, signIn, signOutAdmin, recheck }}>{children}</SessionContext.Provider>;
}

export function useAdminSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('AdminSessionProvider 안에서만 쓴다');
  return value;
}
