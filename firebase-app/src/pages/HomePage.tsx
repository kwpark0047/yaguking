import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { Mascot } from '@/components/brand/Mascot';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { startAsGuest } from '@/lib/auth/actions';
import { authErrorMessage } from '@/lib/auth/messages';

/**
 * 1단계 메인 — 로그인 상태가 보이는지만 확인하는 자리다. 게임 화면은 4단계.
 */
export function HomePage() {
  const { user, isGuest, profile } = useAuth();
  const nickname = profile.status === 'ready' ? profile.data.nickname : null;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function guest() {
    setPending(true);
    setError(null);
    try {
      await startAsGuest();
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-4">
      <SiteHeader />
      <main className="home-hero flex flex-col items-center gap-4 px-5 py-10 text-center">
        <Mascot className="h-36 w-36" />
        <h1 className="font-cute text-4xl">야구 상식으로 홈런 치자!</h1>

        {user === undefined ? (
          <p className="text-sm text-ink-2">불러오는 중…</p>
        ) : user && !isGuest ? (
          <p className="text-sm text-ink-2" role="status">
            {nickname ? `${nickname} 선수, 반가워요!` : `${user.email ?? '회원'} 계정으로 로그인했어요.`} 게임은 곧 열려요.
          </p>
        ) : isGuest ? (
          <p className="text-sm text-ink-2" role="status">
            비회원으로 플레이 중이에요. 가입하면 지금까지의 기록이 그대로 회원 기록이 돼요.
          </p>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => void guest()}
              className="squishy font-cute min-h-14 px-8 text-2xl disabled:opacity-60"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              비회원으로 시작
            </button>
            <p className="text-xs text-ink-2">가입 없이 바로 시작해요. 나중에 가입하면 기록이 이어져요.</p>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
