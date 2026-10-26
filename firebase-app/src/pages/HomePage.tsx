import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { Mascot } from '@/components/brand/Mascot';
import { SiteHeader } from '@/components/layout/SiteHeader';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };
const secondary = { borderColor: 'var(--line)' };

/**
 * 메인 — 게임 시작, 레벨 테스트(회원, 아직 안 했으면), 오답노트.
 * 로그인하지 않았어도 "게임 시작"이면 비회원으로 바로 들어간다(첫 투구까지 한 번).
 */
export function HomePage() {
  const { user, isGuest, profile } = useAuth();
  const member = !!user && !isGuest;
  const nickname = profile.status === 'ready' ? profile.data.nickname : null;
  const levelTestPending = member && profile.status === 'ready' && !profile.data.levelTestDone;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-4">
      <SiteHeader />
      <main className="home-hero flex flex-col items-center gap-4 px-5 py-10 text-center">
        <Mascot className="h-36 w-36" />
        <h1 className="font-cute text-4xl">야구 상식으로 홈런 치자!</h1>

        {user === undefined ? (
          <p className="text-sm text-ink-2">불러오는 중…</p>
        ) : (
          <>
            <p className="text-sm text-ink-2 break-keep" role="status">
              {member
                ? `${nickname ?? '회원'} 선수, 반가워요!`
                : isGuest
                  ? '비회원으로 플레이 중이에요. 가입하면 지금까지의 기록이 그대로 회원 기록이 돼요.'
                  : '문제는 투구, 빨리 맞히면 홈런! 3아웃이면 1이닝이 끝나요.'}
            </p>
            <div className="flex w-full max-w-sm flex-col gap-2">
              <Link to="/play" className="squishy font-cute flex min-h-16 items-center justify-center gap-2 text-2xl" style={primary}>
                게임 시작 <span aria-hidden="true">▶</span>
              </Link>
              {levelTestPending && (
                <Link to="/level-test" className="flex min-h-14 items-center justify-center rounded-option border-2 font-semibold" style={secondary}>
                  레벨 테스트로 처음 등급 정하기
                </Link>
              )}
              {user && (
                <Link to="/notes" className="flex min-h-14 items-center justify-center rounded-option border-2 font-semibold" style={secondary}>
                  오답노트
                </Link>
              )}
            </div>
            {!user && <p className="text-xs text-ink-2">가입 없이 바로 시작해요. 비회원은 하루 2판이에요.</p>}
            <p className="text-xs text-ink-2">점수는 기기에서 채점하는 비공식 기록이에요.</p>
          </>
        )}
      </main>
    </div>
  );
}
