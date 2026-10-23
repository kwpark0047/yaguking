'use client';

import { useState } from 'react';
import {
  createSupabaseBrowserClient,
  enabledOAuthProviders,
  isAuthConfigured,
} from '@/lib/supabase/client';

const PROVIDER_LABEL: Record<'google' | 'kakao', string> = {
  google: '구글로 계속하기',
  kakao: '카카오로 계속하기',
};

/**
 * V04 로그인 (08 문서).
 *
 * 소셜이 1차, 이메일은 접힌 보조 옵션이다. 실제로 설정된 공급자만 보여준다.
 * 약관·개인정보 동의는 버튼 지점에 한 줄 + 링크로 둔다.
 */
export function AuthForm({ returnTo, error }: { returnTo: string; error?: string }) {
  const [email, setEmail] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const configured = isAuthConfigured();
  const providers = enabledOAuthProviders();

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`;

  async function signInWithProvider(provider: 'google' | 'kakao') {
    setPending(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectTo() },
      });
      if (signInError) setMessage(signInError.message);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '로그인에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  async function signInWithEmail() {
    setPending(true);
    setMessage(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo() },
      });
      setMessage(
        otpError ? otpError.message : '메일함을 확인해 주세요. 로그인 링크를 보냈습니다.',
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '로그인에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold">3초 만에 저장하기</h1>
      <p className="text-sm text-ink-2 break-keep">
        로그인하면 지금까지의 타석이 통산 기록에 적립되고, 다음에 이어서 쌓입니다.
      </p>

      {error && (
        <p className="text-sm" style={{ color: 'var(--out)' }} role="alert">
          {error}
        </p>
      )}

      {!configured && (
        <p
          className="rounded-option border p-3 text-sm"
          style={{ borderColor: 'var(--line)' }}
          role="status"
        >
          Auth 공급자가 아직 설정되지 않았습니다. `.env.local`에
          `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 채우면
          이 화면이 동작합니다.
        </p>
      )}

      {configured &&
        providers.map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={pending}
            onClick={() => void signInWithProvider(provider)}
            className="min-h-14 rounded-option font-semibold disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {PROVIDER_LABEL[provider]}
          </button>
        ))}

      {configured && (
        <>
          {!emailOpen ? (
            <button
              type="button"
              onClick={() => setEmailOpen(true)}
              className="min-h-11 text-sm text-ink-2 underline"
            >
              이메일로 로그인
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm">
                이메일
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-h-14 rounded-option border px-3"
                style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
              />
              <button
                type="button"
                disabled={pending || email.length === 0}
                onClick={() => void signInWithEmail()}
                className="min-h-14 rounded-option font-semibold disabled:opacity-60"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                로그인 링크 받기
              </button>
            </div>
          )}
        </>
      )}

      {message && (
        <p className="text-sm text-ink-2" role="status">
          {message}
        </p>
      )}

      <p className="text-xs text-ink-2">
        계속하면 이용약관과 개인정보 처리방침에 동의하는 것으로 봅니다. (문서 링크는
        단계 8에서 연결합니다.)
      </p>
    </main>
  );
}
