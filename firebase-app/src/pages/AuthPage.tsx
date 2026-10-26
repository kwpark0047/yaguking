import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { continueWithGoogle, signInWithEmail, signUpWithEmail } from '@/lib/auth/actions';
import { authErrorMessage, passwordProblem } from '@/lib/auth/messages';
import { sanitizeReturnTo } from '@/lib/auth/returnTo';

type Mode = 'login' | 'signup';

const inputStyle = { borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' };

/**
 * 로그인·가입 (Firebase판). 이메일·비밀번호와 구글.
 *
 * 비회원(익명)이 **가입**하면 그 계정에 연결되어 기록이 이어진다. 비회원이 기존
 * 계정으로 **로그인**하면 그 계정으로 바뀌어 비회원 기록은 따라가지 않으므로 미리 알린다.
 */
export function AuthPage() {
  const [params] = useSearchParams();
  const mode: Mode = params.get('mode') === 'signup' ? 'signup' : 'login';
  const returnTo = sanitizeReturnTo(params.get('returnTo'));
  const navigate = useNavigate();
  const { isGuest } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const signup = mode === 'signup';
  const other = `/auth?mode=${signup ? 'login' : 'signup'}&returnTo=${encodeURIComponent(returnTo)}`;

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      // 만 14세 확인이 필요하면 레이아웃이 확인 화면으로 보낸다.
      navigate(returnTo, { replace: true });
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (signup) {
      const problem = passwordProblem(password, confirm);
      if (problem) {
        setError(problem);
        return;
      }
      void run(() => signUpWithEmail(email.trim(), password));
    } else {
      void run(() => signInWithEmail(email.trim(), password));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 py-8">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">{signup ? '야구왕 선수 등록' : '다시 만나서 반가워요!'}</h1>
      <p className="text-sm text-ink-2 break-keep">
        {signup
          ? '가입하면 기록이 쌓이고 업적 카드를 모을 수 있어요. 만 14세 이상만 가입할 수 있어요.'
          : '로그인하고 이어서 기록을 쌓아요.'}
      </p>

      {isGuest && (
        <p className="sticker p-3 text-sm break-keep" role="note">
          {signup
            ? '지금 비회원으로 쌓은 기록이 가입한 계정으로 그대로 이어져요.'
            : '기존 계정으로 로그인하면 지금 비회원으로 쌓은 기록은 따라가지 않아요. 기록을 이어 가려면 새로 가입해 주세요.'}
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
          {error}
        </p>
      )}

      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <label className="flex flex-col gap-1 text-sm">
          이메일
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-12 rounded-option border px-3 text-base"
            style={inputStyle}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          비밀번호
          <input
            type="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-12 rounded-option border px-3 text-base"
            style={inputStyle}
          />
        </label>
        {signup && (
          <label className="flex flex-col gap-1 text-sm">
            비밀번호 확인 (8자 이상)
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className="min-h-12 rounded-option border px-3 text-base"
              style={inputStyle}
            />
          </label>
        )}
        <button
          type="submit"
          disabled={pending}
          className="squishy font-cute min-h-14 text-xl disabled:opacity-60"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          {pending ? '잠시만요…' : signup ? '이메일로 가입하기' : '이메일로 로그인'}
        </button>
      </form>

      <button
        type="button"
        disabled={pending}
        onClick={() => void run(continueWithGoogle)}
        className="min-h-14 rounded-option border-2 font-semibold disabled:opacity-60"
        style={{ borderColor: 'var(--line)' }}
      >
        구글로 계속하기
      </button>

      {!signup && (
        <Link to="/auth/reset" className="flex min-h-11 items-center text-sm text-ink-2 underline">
          비밀번호를 잊었어요
        </Link>
      )}

      <p className="text-sm text-ink-2">
        {signup ? '이미 선수 등록을 했나요? ' : '야구왕이 처음인가요? '}
        <Link to={other} className="font-semibold underline" style={{ color: 'var(--ink-1)' }}>
          {signup ? '로그인' : '가입하기'}
        </Link>
      </p>

      <p className="text-xs text-ink-2 break-keep">
        계속하면{' '}
        <Link to="/terms" className="underline" style={{ color: 'var(--ink-1)' }}>
          이용약관
        </Link>
        과{' '}
        <Link to="/privacy" className="underline" style={{ color: 'var(--ink-1)' }}>
          개인정보처리방침
        </Link>
        에 동의하는 것으로 봅니다. 두 문서의 Firebase판은 아직 확정 전입니다.
      </p>
    </main>
  );
}
