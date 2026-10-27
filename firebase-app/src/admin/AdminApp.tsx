import { useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router';
import { DENIAL_MESSAGE, maskEmail, signInProblem } from '@/lib/admin/access';
import { DashboardPage } from './pages/DashboardPage';
import { LogsPage } from './pages/LogsPage';
import { MemberDetailPage, MembersPage } from './pages/MembersPage';
import { NoticesPage } from './pages/NoticesPage';
import { SignupsPage } from './pages/SignupsPage';
import { AdminSessionProvider, useAdminSession } from './session';
import { ErrorText, line, primary } from './ui';

/**
 * 야구왕 관리자 사이트(docs/admin-plan.md, 1차: 골격·공지·가입자·가입 확인).
 * 별도 Hosting 사이트로 올린다. 구글 로그인 + 관리자 표시가 있어야 열리고, 막는 것은 보안 규칙이다.
 */
export function AdminApp() {
  return (
    <AdminSessionProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AdminSessionProvider>
  );
}

function Gate() {
  const { session, signIn, signOutAdmin, recheck } = useAdminSession();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(signInProblem((caught as { code?: string }).code));
    } finally {
      setBusy(false);
    }
  }

  if (session.kind === 'loading') return <p className="p-6 text-sm text-ink-2">불러오는 중…</p>;

  if (session.kind !== 'admin') {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-bold">야구왕 관리자</h1>
        {session.kind === 'signed-out' ? (
          <>
            <p className="text-sm text-ink-2 break-keep">관리자 표시가 있는 구글 계정으로만 들어올 수 있어요.</p>
            {error && <ErrorText>{error}</ErrorText>}
            <button type="button" disabled={busy} onClick={() => void act(signIn)} className="min-h-12 rounded-option font-semibold disabled:opacity-60" style={primary}>
              구글로 로그인
            </button>
          </>
        ) : (
          <>
            <ErrorText>{DENIAL_MESSAGE[session.reason]}</ErrorText>
            <p className="text-sm text-ink-2 break-keep">
              로그인한 계정: {maskEmail(session.user.email)} · uid <code className="num-tabular">{session.user.uid}</code>
            </p>
            {error && <ErrorText>{error}</ErrorText>}
            <button type="button" disabled={busy} onClick={() => void act(recheck)} className="min-h-12 rounded-option font-semibold disabled:opacity-60" style={primary}>
              다시 확인
            </button>
            <button type="button" onClick={() => void signOutAdmin()} className="min-h-12 rounded-option border-2 font-semibold" style={line}>
              로그아웃
            </button>
          </>
        )}
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-4 px-4 py-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-lg font-bold">야구왕 관리자</p>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-2">{maskEmail(session.user.email)}</span>
          <button type="button" onClick={() => void signOutAdmin()} className="min-h-11 underline">
            로그아웃
          </button>
        </div>
      </header>
      <nav aria-label="관리 메뉴" className="flex flex-wrap gap-1 border-b pb-2" style={line}>
        {[
          ['/', '대시보드'],
          ['/members', '가입자'],
          ['/signups', '가입 확인'],
          ['/notices', '공지사항'],
          ['/logs', '관리자 기록'],
        ].map(([to, label]) => (
          <NavLink
            key={to}
            to={to!}
            end={to === '/'}
            className={({ isActive }) => `flex min-h-11 items-center rounded-option px-3 text-sm font-semibold ${isActive ? '' : 'text-ink-2'}`}
            style={({ isActive }) => (isActive ? primary : undefined)}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="flex flex-col gap-4 pb-8">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/members/:uid" element={<MemberDetailPage />} />
          <Route path="/signups" element={<SignupsPage />} />
          <Route path="/notices" element={<NoticesPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="*" element={<p className="text-sm">없는 화면이에요.</p>} />
        </Routes>
      </main>
    </div>
  );
}
