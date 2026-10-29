import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import emblem from '@/assets/brand/yaguking-emblem.webp';
import { TextSizeSetting, ThemeSetting } from '@/components/display/DisplaySettings';
import { EffectsSetting, SoundSetting } from '@/components/effects/Effects';
import { AdSlot } from '@/components/ads/AdSlot';
import { HowToPlay } from '@/components/home/HowToPlay';
import { NewsPreview } from '@/components/home/NewsPreview';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { NoticeBanner } from '@/components/NoticeBanner';
import { engagementOpen, engagementStart, kstDate } from '@/lib/game/attendance';
import { GUEST_DAILY_GAMES } from '@/lib/game/guestLimit';

// 출석 카드는 Firestore를 쓰므로 회원에게만, 들어갈 때 불러온다(첫 화면 묶음에 SDK를 넣지 않는다)
const AttendanceCard = lazy(() => import('@/components/engagement/AttendanceCard'));

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };
const secondary = { borderColor: 'var(--line)', backgroundColor: 'var(--hero-button-bg)' };

/**
 * 메인 — 맨 위 광고 자리(docs/ads-plan.md), 게임 시작, 레벨 테스트(회원, 아직 안 했으면), 오답노트, 이렇게 놀아요, 오늘 출석(회원 — docs/engagement-plan.md),
 * 최신 소식(운영자 PC가 글마다 출처·날짜를 확인한 글만 — docs/news.md), 맨 아래 공지 띠.
 * 로그인하지 않았어도 "게임 시작"이면 비회원으로 바로 들어간다(첫 투구까지 한 번).
 */
export function HomePage() {
  const { user, isGuest, profile } = useAuth();
  const member = !!user && !isGuest;
  const nickname = profile.status === 'ready' ? profile.data.nickname : null;
  const levelTestPending = member && profile.status === 'ready' && !profile.data.levelTestDone;
  const ready = member && profile.status === 'ready' && profile.ageConfirmed;
  const open = engagementOpen(kstDate());
  const start = engagementStart();

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-4">
      <SiteHeader />
      <AdSlot slot="home-top" />
      <main className="home-hero flex flex-col items-center gap-4 px-5 py-10 text-center">
        <img src={emblem} alt="야구왕" width={349} height={440} className="h-44 w-auto" />
        <h1 className="font-cute text-4xl break-keep">야구 상식으로 홈런 치자!</h1>

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
              <Link to="/room" className="flex min-h-14 items-center justify-center rounded-option border-2 font-semibold" style={secondary}>
                친구 대결
              </Link>
              {levelTestPending && (
                <Link to="/level-test" className="flex min-h-14 items-center justify-center rounded-option border-2 font-semibold" style={secondary}>
                  레벨 테스트로 처음 등급 정하기
                </Link>
              )}
              {member && open && (
                <Link to="/official" className="flex min-h-14 items-center justify-center rounded-option border-2 font-semibold" style={secondary}>
                  오늘의 공식전 (5문제)
                </Link>
              )}
              {user && open && (
                <Link to="/ranking" className="flex min-h-14 items-center justify-center rounded-option border-2 font-semibold" style={secondary}>
                  월간 등수
                </Link>
              )}
              {user && (
                <Link to="/notes" className="flex min-h-14 items-center justify-center rounded-option border-2 font-semibold" style={secondary}>
                  오답노트
                </Link>
              )}
            </div>
            {!user && <p className="text-xs text-ink-2">가입 없이 바로 시작해요. 비회원은 하루 {GUEST_DAILY_GAMES}판이에요.</p>}
            <p className="text-xs text-ink-2">점수는 기기에서 채점하는 비공식 기록이에요.</p>
            <div className="flex flex-wrap items-center justify-center gap-x-4">
              <Link to="/notices" className="flex min-h-11 items-center text-xs text-ink-2 underline">
                공지사항
              </Link>
              <ThemeSetting compact />
              <TextSizeSetting compact />
              <EffectsSetting compact />
              <SoundSetting compact />
            </div>
          </>
        )}
      </main>
      <HowToPlay />
      {user !== undefined &&
        (open && ready && user ? (
          <Suspense fallback={null}>
            <AttendanceCard uid={user.uid} team={profile.status === 'ready' ? (profile.data.favoriteTeams[0] ?? null) : null} />
          </Suspense>
        ) : (
          <section aria-labelledby="attendance-title" className="sticker flex flex-col gap-2 p-4 text-sm break-keep">
            <h2 id="attendance-title" className="font-cute text-xl">
              {open ? '매일 출석 · 월간 등수' : '곧 시작: 매일 출석 · 월간 등수'}
            </h2>
            <p>
              {open
                ? '회원은 하루 한 번 출석 도장을 찍고 포인트를 모아 이달의 야구왕에 도전해요.'
                : `${Number(start.slice(5, 7))}월 ${Number(start.slice(8, 10))}일부터 회원은 하루 한 번 출석 도장을 찍고, 모은 포인트로 월간 등수에 올라요.`}
            </p>
            {!member && (
              <Link to="/auth?mode=signup&returnTo=%2F" className="flex min-h-11 items-center self-start font-semibold underline">
                가입하고 출석 도장 받기
              </Link>
            )}
          </section>
        ))}
      <NewsPreview />
      {/* 공지 띠는 맨 아래(맨 위는 광고 자리 — docs/ads-plan.md) */}
      <NoticeBanner />
    </div>
  );
}
