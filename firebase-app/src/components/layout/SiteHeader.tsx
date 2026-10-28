import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { BookmarkButton } from '@/components/pwa/BookmarkButton';
import { signOutUser } from '@/lib/auth/actions';

/** 머리줄 — 로고, 즐겨찾기 방법(별표), 그리고 로그인 상태에 따라 로그인/가입 또는 비회원 표시·로그아웃. */
export function SiteHeader() {
  const { user, isGuest, profile } = useAuth();
  const nickname = profile.status === 'ready' ? profile.data.nickname : null;

  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <Link to="/" className="font-cute flex min-h-11 items-center gap-1 text-2xl">
        <span aria-hidden="true">⚾</span>
        야구왕
      </Link>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <BookmarkButton />
        {user === undefined ? null : user && !isGuest ? (
          <>
            <Link
              to="/settings"
              className="flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-semibold"
              style={{ borderColor: 'var(--line)' }}
            >
              {nickname ?? '설정'}
              <span className="sr-only"> 설정</span>
            </Link>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="flex min-h-11 items-center px-2 text-sm text-ink-2 underline"
            >
              로그아웃
            </button>
          </>
        ) : (
          <>
            {isGuest && <span className="text-xs text-ink-2">비회원으로 플레이 중</span>}
            <Link
              to="/auth?mode=login"
              className="flex min-h-11 items-center px-2 text-sm font-semibold"
            >
              로그인
            </Link>
            <Link
              to="/auth?mode=signup"
              className="squishy flex min-h-11 items-center px-4 text-sm font-semibold"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              가입하기
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
