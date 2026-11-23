import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import emblem from '@/assets/brand/yaguking-emblem.webp';
import { needsAgeCheck, waitsForGuardian } from '@/lib/auth/gate';
import { GUARDIAN_WAIT_DAYS, guardianSignupOpen, isGuardianEmail, normalizeEmail } from '@/lib/auth/guardian';
import { confirmAge, deleteOwnAccount, requestGuardianConsent } from '@/lib/auth/profile';
import { authErrorMessage } from '@/lib/auth/messages';
import { sanitizeReturnTo } from '@/lib/auth/returnTo';

type Phase = 'ask' | 'confirmUnder14' | 'guardian' | 'deleted';

/**
 * 만 14세 이상 확인 (Firebase판, 15 문서 §3).
 *
 * 생년월일은 묻지 않는다. 확인 시각만 `users/{uid}`에 서버 시각으로 남긴다.
 * 미만이라고 답하면 한 번 더 묻고 계정을 지운다. 자녀 가입 길이 열려 있으면(src/lib/auth/guardian.ts — 팀 시작일부터,
 * 동의 메일 주소가 정해졌을 때) 보호자 메일 주소를 받아 보호자 동의를 신청할 수도 있다(/guardian).
 *
 * 화면을 건너뛰어도 소용없다 — 확인 전 회원은 보안 규칙이 기록 쓰기를 막는다.
 */
export function AgeCheckPage() {
  const [params] = useSearchParams();
  const returnTo = sanitizeReturnTo(params.get('returnTo'));
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [phase, setPhase] = useState<Phase>('ask');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardianEmail, setGuardianEmail] = useState('');
  const childOpen = guardianSignupOpen();

  if (phase !== 'deleted') {
    if (user === undefined) return null;
    if (!user) return <Navigate to={`/auth?mode=login&returnTo=${encodeURIComponent(returnTo)}`} replace />;
    if (waitsForGuardian(user, profile)) return <Navigate to="/guardian" replace />;
    if (profile.status === 'ready' && !needsAgeCheck(user, profile)) {
      return <Navigate to={returnTo} replace />;
    }
  }

  async function answer(over14: boolean) {
    if (!user) return;
    setPending(true);
    setError(null);
    try {
      if (over14) {
        await confirmAge(user);
        await refreshProfile();
        navigate(returnTo, { replace: true });
      } else {
        await deleteOwnAccount(user);
        setPhase('deleted');
      }
    } catch (caught) {
      setError(
        (caught as { code?: string }).code?.startsWith('auth/')
          ? authErrorMessage(caught)
          : '저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
      );
    } finally {
      setPending(false);
    }
  }

  async function askGuardian() {
    if (!user) return;
    const email = normalizeEmail(guardianEmail);
    if (!isGuardianEmail(email)) {
      setError('보호자 메일 주소를 확인해 주세요.');
      return;
    }
    if (email === normalizeEmail(user.email ?? '')) {
      setError('내 계정 메일이 아니라 보호자(부모님 등)의 메일 주소를 적어 주세요.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await requestGuardianConsent(user, email);
      await refreshProfile();
      navigate('/guardian', { replace: true });
    } catch {
      setError('저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 py-8">
      <img src={emblem} alt="야구왕" width={349} height={440} className="mx-auto h-32 w-auto" />

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
          {error}
        </p>
      )}

      {phase === 'ask' && (
        <>
          <h1 className="font-cute text-3xl">만 14세 이상인가요?</h1>
          <p className="text-sm text-ink-2 break-keep">
            {childOpen
              ? '만 14세 미만은 보호자 동의를 받아 가족팀으로 함께할 수 있어요. 생년월일은 묻지 않아요.'
              : '야구왕은 보호자 동의 절차가 아직 없어 만 14세 이상만 가입할 수 있어요. 생년월일은 묻지 않아요.'}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => void answer(true)}
            className="squishy font-cute min-h-14 px-4 text-xl disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            네, 만 14세 이상이에요
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setPhase('confirmUnder14')}
            className="min-h-11 text-sm text-ink-2 underline"
          >
            아니요, 만 14세 미만이에요
          </button>
        </>
      )}

      {phase === 'confirmUnder14' && (
        <section aria-labelledby="under14-title" className="sticker flex flex-col gap-3 p-5">
          <h1 id="under14-title" className="font-cute text-2xl">
            {childOpen ? '보호자 동의가 필요해요' : '지금은 가입할 수 없어요'}
          </h1>
          {childOpen && (
            <>
              <p className="text-sm break-keep">
                부모님 같은 보호자가 메일로 동의하면 가족팀에서 함께 놀 수 있어요. 동의 전에는 기록이 남지 않고, {GUARDIAN_WAIT_DAYS}일 안에
                동의가 없으면 계정이 지워져요.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => setPhase('guardian')}
                className="squishy font-cute min-h-14 px-4 text-xl disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                보호자 동의 받기
              </button>
              <p className="text-sm text-ink-2 break-keep">동의를 받지 않으려면 계정을 지울 수 있어요.</p>
            </>
          )}
          <p className="text-sm break-keep">
            계속하면 <strong>방금 로그인한 계정과 그 계정의 기록을 바로 지워요.</strong> 되돌릴 수
            없어요. 비회원으로는 계속 플레이할 수 있어요.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => void answer(false)}
            className="min-h-14 rounded-option border-2 font-semibold disabled:opacity-60"
            style={{ borderColor: 'var(--out)', color: 'var(--out)' }}
          >
            {pending ? '지우는 중…' : '계정 지우기'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setPhase('ask')}
            className="min-h-11 text-sm text-ink-2 underline"
          >
            돌아가기
          </button>
        </section>
      )}

      {phase === 'guardian' && (
        <form
          aria-labelledby="guardian-title"
          className="sticker flex flex-col gap-3 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void askGuardian();
          }}
        >
          <h1 id="guardian-title" className="font-cute text-2xl">
            보호자 메일 주소
          </h1>
          <p className="text-sm break-keep">
            보호자께 동의를 받을 때만 쓰는 주소예요. 다음 화면의 안내대로 보호자가 이 주소에서 야구왕에 동의 메일을 보내면, 운영자가 확인한
            뒤 계정이 열려요.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            보호자 메일 주소
            <input
              type="email"
              value={guardianEmail}
              onChange={(event) => setGuardianEmail(event.target.value)}
              autoComplete="off"
              className="min-h-12 rounded-option border px-3"
              style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
            />
          </label>
          <button
            type="submit"
            disabled={pending || guardianEmail.trim().length < 5}
            className="squishy font-cute min-h-14 px-4 text-xl disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {pending ? '저장하는 중…' : '다음'}
          </button>
          <button type="button" disabled={pending} onClick={() => setPhase('confirmUnder14')} className="min-h-11 text-sm text-ink-2 underline">
            돌아가기
          </button>
        </form>
      )}

      {phase === 'deleted' && (
        <section aria-labelledby="deleted-title" className="flex flex-col gap-3" role="status">
          <h1 id="deleted-title" className="font-cute text-2xl">
            계정을 지웠어요
          </h1>
          <p className="text-sm text-ink-2 break-keep">
            만 14세가 되면 다시 가입해 주세요. 그때까지 비회원으로 즐길 수 있어요.
          </p>
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="squishy font-cute min-h-14 px-4 text-xl"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            메인으로
          </button>
        </section>
      )}
    </main>
  );
}
