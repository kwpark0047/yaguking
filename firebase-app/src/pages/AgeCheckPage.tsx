import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import emblem from '@/assets/brand/yaguking-emblem.webp';
import { needsAgeCheck } from '@/lib/auth/gate';
import { confirmAge, deleteOwnAccount } from '@/lib/auth/profile';
import { authErrorMessage } from '@/lib/auth/messages';
import { sanitizeReturnTo } from '@/lib/auth/returnTo';

type Phase = 'ask' | 'confirmUnder14' | 'deleted';

/**
 * 만 14세 이상 확인 (Firebase판, 15 문서 §3).
 *
 * 생년월일은 묻지 않는다. 확인 시각만 `users/{uid}`에 서버 시각으로 남긴다.
 * 미만이라고 답하면 한 번 더 묻고 계정을 지운다.
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

  if (phase !== 'deleted') {
    if (user === undefined) return null;
    if (!user) return <Navigate to={`/auth?mode=login&returnTo=${encodeURIComponent(returnTo)}`} replace />;
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
            야구왕은 보호자 동의 절차가 아직 없어 만 14세 이상만 가입할 수 있어요. 생년월일은
            묻지 않아요.
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
            지금은 가입할 수 없어요
          </h1>
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
