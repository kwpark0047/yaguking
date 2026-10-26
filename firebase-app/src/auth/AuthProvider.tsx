import { onIdTokenChanged, type User } from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ProfileState } from '@/lib/auth/gate';
import { firebaseAuth } from '@/lib/firebase/auth';

interface AuthContextValue {
  /** undefined = 아직 모름(첫 확인 중), null = 로그인 안 함 */
  user: User | null | undefined;
  /** 비회원 여부. User 객체는 연결 후에도 같아서 따로 둔다 */
  isGuest: boolean;
  profile: ProfileState;
  /** 프로필을 다시 읽는다(만 14세 확인 직후 등) */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * 로그인 상태와 회원 프로필을 화면 전체에 나눈다.
 *
 * `onIdTokenChanged`를 쓴다. 비회원 계정에 이메일·구글을 **연결**하면 사용자가
 * 바뀌지 않아 `onAuthStateChanged`가 울리지 않는데, 그러면 갓 가입한 회원이
 * 만 14세 확인을 건너뛰게 된다. 토큰은 연결할 때 새로 발급되므로 이 신호를 쓴다.
 *
 * 토큰은 한 시간마다도 갱신되므로, 프로필은 **사용자나 비회원 여부가 바뀔 때만**
 * 다시 읽는다(무료 읽기 한도). 구독하지 않는다.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ user: User | null | undefined; isGuest: boolean }>({
    user: undefined,
    isGuest: false,
  });
  const [profile, setProfile] = useState<ProfileState>({ status: 'loading' });
  const lastKey = useRef<string | null>(null);

  const refreshFor = useCallback(async (next: User | null) => {
    if (!next || next.isAnonymous) {
      setProfile({ status: 'missing' });
      return;
    }
    setProfile({ status: 'loading' });
    // Firestore SDK는 회원일 때만 불러온다(첫 화면 묶음 크기).
    const { loadProfile } = await import('@/lib/auth/profile');
    setProfile(await loadProfile(next.uid));
  }, []);

  useEffect(() => {
    return onIdTokenChanged(firebaseAuth(), (next) => {
      const key = next ? `${next.uid}:${next.isAnonymous}` : 'signed-out';
      setState({ user: next, isGuest: next?.isAnonymous ?? false });
      if (key === lastKey.current) return;
      lastKey.current = key;
      void refreshFor(next);
    });
  }, [refreshFor]);

  const refreshProfile = useCallback(async () => {
    await refreshFor(firebaseAuth().currentUser);
  }, [refreshFor]);

  return (
    <AuthContext.Provider value={{ ...state, profile, refreshProfile }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider 안에서만 쓸 수 있습니다.');
  return value;
}
