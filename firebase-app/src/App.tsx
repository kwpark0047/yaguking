import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { needsAgeCheck } from '@/lib/auth/gate';
import { AuthPage } from '@/pages/AuthPage';
import { HomePage } from '@/pages/HomePage';
import { LegalPage } from '@/pages/LegalPage';
import { ResetPage } from '@/pages/ResetPage';

/**
 * 만 14세 확인이 필요한 회원을 확인 화면으로 보낸다(어느 화면에 있든).
 * 화면 안내일 뿐이고, 실제로 막는 것은 Firestore 보안 규칙이다.
 */
function AgeGate() {
  const { user, profile } = useAuth();
  const location = useLocation();
  if (user && needsAgeCheck(user, profile)) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={`/welcome/age?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <Outlet />;
}

// 만 14세 확인 화면은 Firestore를 쓰므로 들어갈 때 불러온다.
const AgeCheckPage = lazy(() =>
  import('@/pages/AgeCheckPage').then((module) => ({ default: module.AgeCheckPage })),
);

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
      <BrowserRouter>
        <Routes>
          {/* 로그인·확인·약관 화면은 확인 게이트 밖에 둔다(돌아올 길이 막히지 않게) */}
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/reset" element={<ResetPage />} />
          <Route
            path="/welcome/age"
            element={
              <Suspense fallback={null}>
                <AgeCheckPage />
              </Suspense>
            }
          />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route element={<AgeGate />}>
            <Route path="/" element={<HomePage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
