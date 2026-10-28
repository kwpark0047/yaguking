import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { LoadingBall } from '@/components/effects/Effects';
import { celebrate } from '@/lib/effects/celebrate';
import { currentMode } from '@/lib/effects/preference';
import { playSound } from '@/lib/sound/sound';
import { needsAgeCheck, needsProfileSetup } from '@/lib/auth/gate';
import { applyDocumentTeam } from '@/lib/theme/documentTeam';
import { teamThemesEnabled } from '@/lib/theme/themeSwitch';
import { AuthPage } from '@/pages/AuthPage';
import { HomePage } from '@/pages/HomePage';

import { ResetPage } from '@/pages/ResetPage';

// Firestore를 쓰는 화면은 들어갈 때 불러온다(첫 화면 묶음에 SDK를 넣지 않는다).
const AgeCheckPage = lazy(() =>
  import('@/pages/AgeCheckPage').then((module) => ({ default: module.AgeCheckPage })),
);
const ProfileSetupPage = lazy(() =>
  import('@/pages/ProfileSetupPage').then((module) => ({ default: module.ProfileSetupPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const PlayPage = lazy(() => import('@/pages/PlayPage').then((module) => ({ default: module.PlayPage })));
const LevelTestPage = lazy(() =>
  import('@/pages/LevelTestPage').then((module) => ({ default: module.LevelTestPage })),
);
const LegalPage = lazy(() => import('@/pages/LegalPage').then((module) => ({ default: module.LegalPage })));
const NoticesPage = lazy(() => import('@/pages/NoticesPage').then((module) => ({ default: module.NoticesPage })));
const NotesPage = lazy(() => import('@/pages/NotesPage').then((module) => ({ default: module.NotesPage })));
const RoomLobbyPage = lazy(() =>
  import('@/pages/RoomLobbyPage').then((module) => ({ default: module.RoomLobbyPage })),
);
const RoomPage = lazy(() => import('@/pages/RoomPage').then((module) => ({ default: module.RoomPage })));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingBall />}>{children}</Suspense>;
}

/**
 * 회원이 가야 할 곳으로 보낸다: 만 14세 확인 → 프로필 설정(닉네임·최애 구단).
 * 화면 안내일 뿐이고, 실제로 막는 것은 Firestore 보안 규칙이다.
 */
function MemberGate({ requireProfile }: { requireProfile: boolean }) {
  const { user, profile } = useAuth();
  const location = useLocation();
  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  if (user && needsAgeCheck(user, profile)) {
    return <Navigate to={`/welcome/age?returnTo=${returnTo}`} replace />;
  }
  if (requireProfile && user && needsProfileSetup(user, profile)) {
    return <Navigate to={`/welcome/profile?returnTo=${returnTo}`} replace />;
  }
  return <Outlet />;
}

/** 최애 구단 1위의 테마를 화면 전체에 입힌다(구단 테마 스위치가 켜져 있을 때). */
function TeamThemeSync() {
  const { user, isGuest, profile } = useAuth();
  const slug =
    user && !isGuest && profile.status === 'ready' ? (profile.data.favoriteTeams[0] ?? null) : null;
  useEffect(() => {
    applyDocumentTeam(teamThemesEnabled() ? slug : null);
  }, [slug]);
  return null;
}

/**
 * 화면 전환(docs/motion-plan.md §1) — 주소가 바뀌면 새 화면이 아래에서 8px 올라온다(0.2초, 위치만 — 투명도는 그대로).
 * 화면 효과 "줄이기"·"끄기"·동작 줄이기에서는 움직이지 않는다(CSS).
 */
function AnimatedRoutes({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter">
      <Routes location={location}>{children}</Routes>
    </div>
  );
}

/** 가입이 끝난 첫 화면에서 한 번 — 프로필 저장이 넘긴 표시(state.welcome)를 받아 띠·꽃가루·소리 */
function WelcomeBanner() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [shown, setShown] = useState<{ nickname: string; carried: boolean } | null>(null);
  const welcome = (location.state as { welcome?: boolean } | null)?.welcome === true;

  useEffect(() => {
    if (!welcome || !user) return;
    const nickname = profile.status === 'ready' ? (profile.data.nickname ?? '') : '';
    // 비회원으로 쓰던 계정에 가입을 연결했으면 계정이 가입보다 먼저 만들어졌다 — 기록이 이어졌다
    const created = Date.parse(user.metadata.creationTime ?? '') || Date.now();
    setShown({ nickname, carried: Date.now() - created > 3 * 60_000 });
    celebrate({ kind: 'welcome' });
    playSound('welcome');
    // 새로고침해도 다시 뜨지 않게 표시를 지운다
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [welcome, user, profile, navigate, location.pathname, location.search]);

  // 띠는 2.6초 뒤 닫는다(움직임이 없는 설정에서도 글자를 읽을 시간이 있게 — 애니메이션 끝에 기대지 않는다)
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), 2600);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  return (
    <div role="status" className="welcome-banner font-cute" style={currentMode() === 'none' ? { animation: 'none' } : undefined}>
      환영해요, {shown.nickname ? `${shown.nickname} 선수` : '선수'}!
      {shown.carried && <span className="block font-sans text-sm">비회원으로 쌓은 기록이 그대로 이어졌어요.</span>}
    </div>
  );
}

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 text-center">
      <h1 className="font-cute text-3xl">찾는 화면이 없어요</h1>
      <Link to="/" className="flex min-h-11 items-center justify-center underline">
        메인으로
      </Link>
    </main>
  );
}

export function App() {
  return (
    <AuthProvider>
      <TeamThemeSync />
      <BrowserRouter>
        <WelcomeBanner />
        <AnimatedRoutes>
          {/* 로그인·확인·약관 화면은 게이트 밖에 둔다(돌아올 길이 막히지 않게) */}
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/reset" element={<ResetPage />} />
          <Route path="/welcome/age" element={<Lazy><AgeCheckPage /></Lazy>} />
          <Route path="/welcome/profile" element={<Lazy><ProfileSetupPage /></Lazy>} />
          <Route path="/terms" element={<Lazy><LegalPage kind="terms" /></Lazy>} />
          <Route path="/privacy" element={<Lazy><LegalPage kind="privacy" /></Lazy>} />
          <Route path="/notices" element={<Lazy><NoticesPage /></Lazy>} />
          <Route element={<MemberGate requireProfile={false} />}>
            <Route path="/settings" element={<Lazy><SettingsPage /></Lazy>} />
          </Route>
          <Route element={<MemberGate requireProfile />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/play" element={<Lazy><PlayPage /></Lazy>} />
            <Route path="/level-test" element={<Lazy><LevelTestPage /></Lazy>} />
            <Route path="/notes" element={<Lazy><NotesPage /></Lazy>} />
            <Route path="/room" element={<Lazy><RoomLobbyPage /></Lazy>} />
            <Route path="/room/:code" element={<Lazy><RoomPage /></Lazy>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </AnimatedRoutes>
      </BrowserRouter>
    </AuthProvider>
  );
}
