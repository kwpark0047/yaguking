import { useEffect, useRef, useState } from 'react';
import { startAsGuest } from '@/lib/auth/actions';
import { authErrorMessage } from '@/lib/auth/messages';
import { useAuth } from './AuthProvider';

/**
 * 로그인하지 않았으면 그 자리에서 비회원(익명)으로 들어간다. 받은 링크로 바로
 * 대결 방에 들어오는 친구가 가입부터 하지 않게. 실패하면 오류 문구를 돌려준다.
 */
export function useGuestFallback(): string | null {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const starting = useRef(false);

  useEffect(() => {
    if (user !== null || starting.current) return;
    starting.current = true;
    startAsGuest()
      .catch((reason) => setError(authErrorMessage(reason)))
      .finally(() => {
        starting.current = false;
      });
  }, [user]);

  return error;
}
