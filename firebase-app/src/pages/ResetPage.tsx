import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { sendPasswordReset } from '@/lib/auth/actions';
import { authErrorMessage } from '@/lib/auth/messages';

/**
 * 비밀번호 재설정 메일 (Spark: 하루 150통).
 * 가입 여부를 캐낼 수 없도록, 없는 이메일이어도 같은 안내를 보인다.
 */
export function ResetPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await sendPasswordReset(email.trim());
      setSent(true);
    } catch (caught) {
      const code = (caught as { code?: string }).code;
      if (code === 'auth/user-not-found') setSent(true);
      else setError(authErrorMessage(caught));
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 py-8">
      <Link
        to="/auth?mode=login"
        className="flex min-h-11 items-center self-start text-sm text-ink-2 underline"
      >
        ← 로그인
      </Link>
      <h1 className="font-cute text-3xl">비밀번호 다시 정하기</h1>
      {sent ? (
        <p role="status" className="text-sm break-keep">
          가입된 이메일이라면 재설정 메일을 보냈어요. 메일함을 확인해 주세요.
        </p>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            가입한 이메일
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="min-h-12 rounded-option border px-3 text-base"
              style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            className="squishy font-cute min-h-14 text-xl"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            재설정 메일 받기
          </button>
        </form>
      )}
    </main>
  );
}
