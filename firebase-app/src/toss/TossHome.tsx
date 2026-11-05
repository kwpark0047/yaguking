import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import emblem from '@/assets/brand/yaguking-emblem.webp';
import { useAuth } from '@/auth/AuthProvider';
import { TextSizeSetting } from '@/components/display/DisplaySettings';
import { EffectsSetting, SoundSetting } from '@/components/effects/Effects';
import { DailyLink } from '@/components/home/DailyLink';
import { HowToPlay } from '@/components/home/HowToPlay';
import { NewsPreview } from '@/components/home/NewsPreview';
import { NoticeBanner } from '@/components/NoticeBanner';
import { GUEST_DAILY_GAMES } from '@/lib/game/guestLimit';

const ReviewDue = lazy(() => import('@/components/home/ReviewDue'));

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };
const secondary = { borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' };

/**
 * 미니앱판 메인 — 웹판 메인에서 정책에 걸리는 것(로그인·가입 안내, 광고, 즐겨찾기·설치 권유, 달력 파일·외부 링크, 출석·등수)을 뺐다.
 * 진입하자마자 뜨는 창은 없다.
 */
export function TossHome() {
  const { user } = useAuth();
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-4">
      <main className="flex flex-col items-center gap-4 px-5 py-6 text-center">
        <img src={emblem} alt="야구왕" width={349} height={440} className="h-36 w-auto" />
        <h1 className="font-cute text-4xl break-keep">야구 상식으로 홈런 치자!</h1>
        <p className="text-sm text-ink-2 break-keep">문제는 투구, 빨리 맞히면 홈런! 3아웃이면 1이닝이 끝나요.</p>
        <div className="flex w-full max-w-sm flex-col gap-2">
          <Link to="/play" className="squishy font-cute flex min-h-16 items-center justify-center gap-2 text-2xl" style={primary}>
            게임 시작 <span aria-hidden="true">▶</span>
          </Link>
          <DailyLink style={secondary} />
          {user && (
            <Suspense fallback={null}>
              <ReviewDue uid={user.uid} style={secondary} />
            </Suspense>
          )}
          <Link to="/room" className="flex min-h-14 items-center justify-center rounded-option border-2 font-semibold" style={secondary}>
            친구 대결
          </Link>
          {user && (
            <Link to="/notes" className="flex min-h-14 items-center justify-center rounded-option border-2 font-semibold" style={secondary}>
              오답노트
            </Link>
          )}
        </div>
        <p className="text-xs text-ink-2">개인 경기는 하루 {GUEST_DAILY_GAMES}판이에요. 점수는 기기에서 채점하는 비공식 기록이에요.</p>
        <div className="flex flex-wrap items-center justify-center gap-x-4">
          <Link to="/notices" className="flex min-h-11 items-center text-xs text-ink-2 underline">
            공지사항
          </Link>
          <Link to="/privacy" className="flex min-h-11 items-center text-xs text-ink-2 underline">
            개인정보 처리방침
          </Link>
          <TextSizeSetting compact />
          <EffectsSetting compact />
          <SoundSetting compact />
        </div>
      </main>
      <HowToPlay />
      <NewsPreview />
      <NoticeBanner />
    </div>
  );
}
