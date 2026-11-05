import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthProvider } from '@/auth/AuthProvider';
import { LoadingBall } from '@/components/effects/Effects';
import { TossHome } from './TossHome';

const PlayPage = lazy(() => import('@/pages/PlayPage').then((module) => ({ default: module.PlayPage })));
const DailyPage = lazy(() => import('@/pages/DailyPage').then((module) => ({ default: module.DailyPage })));
const NotesPage = lazy(() => import('@/pages/NotesPage').then((module) => ({ default: module.NotesPage })));
const RoomLobbyPage = lazy(() => import('@/pages/RoomLobbyPage').then((module) => ({ default: module.RoomLobbyPage })));
const RoomPage = lazy(() => import('@/pages/RoomPage').then((module) => ({ default: module.RoomPage })));
const LegalPage = lazy(() => import('@/pages/LegalPage').then((module) => ({ default: module.LegalPage })));
const NoticesPage = lazy(() => import('@/pages/NoticesPage').then((module) => ({ default: module.NoticesPage })));
const NewsPage = lazy(() => import('@/pages/NewsPage').then((module) => ({ default: module.NewsPage })));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingBall />}>{children}</Suspense>;
}

function Pages() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter">
      <Routes location={location}>
        <Route path="/" element={<TossHome />} />
        <Route path="/play" element={<Lazy><PlayPage /></Lazy>} />
        <Route path="/daily" element={<Lazy><DailyPage /></Lazy>} />
        <Route path="/notes" element={<Lazy><NotesPage /></Lazy>} />
        <Route path="/room" element={<Lazy><RoomLobbyPage /></Lazy>} />
        <Route path="/room/:code" element={<Lazy><RoomPage /></Lazy>} />
        <Route path="/news" element={<Lazy><NewsPage /></Lazy>} />
        <Route path="/notices" element={<Lazy><NoticesPage /></Lazy>} />
        <Route path="/privacy" element={<Lazy><LegalPage kind="privacy" /></Lazy>} />
        <Route path="/terms" element={<Lazy><LegalPage kind="terms" /></Lazy>} />
        {/* 회원 화면(로그인·출석·등수·공식전·레벨 테스트·설정)은 이 판에 없다 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

/**
 * 앱인토스 미니앱판(docs/toss-miniapp.md) — 비회원 전용. 토스 로그인은 서버(mTLS)와 사업자 등록이 필요해 이 판에는 없고,
 * Firebase 익명 계정으로 웹판의 비회원과 같은 기능(개인 경기 하루 3판·오늘의 1이닝·오답노트·친구 대결)을 쓴다.
 */
export function TossApp() {
  // 외부 링크로 나가지 않는다(앱인토스 정책 — 토스 도메인 안에서 완결)
  useEffect(() => {
    const block = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
      if (link && link.origin !== location.origin) event.preventDefault();
    };
    document.addEventListener('click', block, true);
    return () => document.removeEventListener('click', block, true);
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <Pages />
      </BrowserRouter>
    </AuthProvider>
  );
}
