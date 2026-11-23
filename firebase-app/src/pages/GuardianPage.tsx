import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { GUARDIAN_CONSENT_EMAIL, GUARDIAN_WAIT_DAYS, guardianMail, guardianMailto } from '@/lib/auth/guardian';
import { deleteOwnAccount, loadGuardianRequest } from '@/lib/auth/profile';
import { copyText } from '@/lib/platform/share';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };

/**
 * 보호자 동의를 기다리는 자녀 계정(src/lib/auth/guardian.ts) — 동의 코드와, 보호자가 보낼 동의 메일(쓰기 단추·복사).
 * 운영자가 메일을 확인해 승인하면 프로필 설정으로 넘어간다. 동의 전에는 기록이 남지 않고, 7일이 지나면 0시 작업이 계정을 지운다.
 */
export function GuardianPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [request, setRequest] = useState<{ email: string; code: string; requestedAt: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const pending = profile.status === 'ready' && profile.data.guardian === 'pending';

  useEffect(() => {
    if (!user || !pending) return;
    let alive = true;
    loadGuardianRequest(user.uid)
      .then((value) => alive && setRequest(value))
      .catch(() => alive && setError('동의 정보를 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요.'));
    return () => {
      alive = false;
    };
  }, [user, pending]);

  if (deleted) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 py-8" role="status">
        <h1 className="font-cute text-2xl">계정을 지웠어요</h1>
        <p className="text-sm text-ink-2 break-keep">비회원으로는 계속 즐길 수 있어요.</p>
        <Link to="/" className="flex min-h-14 items-center justify-center rounded-option font-cute text-xl" style={primary}>
          처음으로
        </Link>
      </main>
    );
  }
  if (user === undefined || profile.status === 'loading') return null;
  if (!user || user.isAnonymous) return <Navigate to="/" replace />;
  if (!pending) return <Navigate to="/" replace />;

  const deadline = request ? new Date(request.requestedAt + GUARDIAN_WAIT_DAYS * 86_400_000 + 9 * 3_600_000) : null;
  const mail = request ? guardianMail(request.code, null) : null;

  async function check() {
    setBusy(true);
    setError(null);
    await refreshProfile();
    setBusy(false);
    setMessage('아직 확인 중이에요. 운영자가 메일을 확인하면 열려요(보통 하루 안).');
  }

  async function remove() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await deleteOwnAccount(user);
      setDeleted(true);
    } catch {
      setError('지우지 못했어요. 로그아웃했다가 다시 로그인한 뒤 해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col gap-4 px-4 py-8">
      <h1 className="font-cute text-3xl">보호자 동의 기다리는 중</h1>
      <p className="text-sm break-keep">
        보호자께 이 화면을 보여 드리세요. 보호자가 <strong>{request?.email ?? '적은 메일 주소'}</strong>에서 아래 동의 메일을 보내면, 운영자가
        확인한 뒤 계정이 열려요.
      </p>
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {request && mail && GUARDIAN_CONSENT_EMAIL && (
        <section aria-labelledby="consent-code" className="sticker flex flex-col gap-3 p-4">
          <h2 id="consent-code" className="text-sm text-ink-2">
            동의 코드
          </h2>
          <p className="font-cute text-4xl tracking-[0.2em]" aria-label={`동의 코드 ${request.code.split('').join(' ')}`}>
            {request.code}
          </p>
          <p className="text-sm break-keep">
            받는 곳: <strong>{GUARDIAN_CONSENT_EMAIL}</strong>
          </p>
          <a href={guardianMailto(GUARDIAN_CONSENT_EMAIL, request.code, null)} className="flex min-h-14 items-center justify-center rounded-option font-cute text-xl" style={primary}>
            동의 메일 쓰기
          </a>
          <button
            type="button"
            onClick={() => void copyText(`${mail.subject}\n\n${mail.body}`).then((ok) => setMessage(ok ? '동의 내용을 복사했어요. 메일 본문에 붙여 넣어 주세요.' : '복사하지 못했어요.'))}
            className="min-h-11 text-sm underline"
          >
            동의 내용 복사
          </button>
          {deadline && (
            <p className="text-xs text-ink-2 break-keep">
              {deadline.getUTCMonth() + 1}월 {deadline.getUTCDate()}일까지 동의가 없으면 계정과 보호자 메일 주소를 지워요. 동의 전에는 기록이 남지 않아요.
            </p>
          )}
        </section>
      )}
      <button type="button" disabled={busy} onClick={() => void check()} className="min-h-12 rounded-option border-2 font-semibold disabled:opacity-60" style={{ borderColor: 'var(--line)' }}>
        동의됐는지 확인하기
      </button>
      <button type="button" disabled={busy} onClick={() => void remove()} className="min-h-11 text-sm underline" style={{ color: 'var(--out)' }}>
        동의받지 않고 계정 지우기
      </button>
      <Link to="/privacy" className="min-h-11 self-start text-sm underline">
        개인정보처리방침 9절 보기
      </Link>
    </main>
  );
}
