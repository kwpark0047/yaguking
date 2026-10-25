'use client';

import Link from 'next/link';
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

export type AuthMode = 'login' | 'signup';

/** 모드별 문구. 경기 결과에서 저장하러 온 경우는 따로 말한다. */
function copyFor(mode: AuthMode, returnTo: string) {
  if (returnTo.startsWith('/play/')) {
    return {
      title: '3초 만에 저장하기',
      lead: '로그인하면 지금까지의 타석이 통산 기록에 적립되고, 다음에 이어서 쌓입니다.',
    };
  }
  return mode === 'signup'
    ? {
        title: '야구왕 선수 등록',
        lead: '가입하면 기록이 쌓이고, 등급이 오르고, 업적 카드를 모을 수 있어요. 비회원으로 친 기록도 그대로 옮겨 와요.',
      }
    : {
        title: '다시 만나서 반가워요!',
        lead: '로그인하고 이어서 기록을 쌓아요.',
      };
}

/**
 * V04 로그인·가입 (08 문서).
 *
 * 소셜이 1차, 이메일은 접힌 보조 옵션이다. 실제로 설정된 공급자만 보여준다.
 * 약관·개인정보 동의는 버튼 지점에 한 줄 + 링크로 둔다.
 *
 * 로그인과 가입은 **같은 흐름**이다. 소셜·이메일 링크 모두 처음 오는 사람이면
 * 계정을 새로 만든다. 그래서 비밀번호 칸이 없고, 모드는 문구만 바꾼다.
 */
export function AuthForm({
  returnTo,
  error,
  mode = 'login',
}: {
  returnTo: string;
  error?: string;
  mode?: AuthMode;
}) {
  const copy = copyFor(mode, returnTo);
  const otherMode: AuthMode = mode === 'signup' ? 'login' : 'signup';
  const otherHref = `/auth?mode=${otherMode}&returnTo=${encodeURIComponent(returnTo)}`;
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
        otpError
          ? otpError.message
          : `메일함을 확인해 주세요. ${mode === 'signup' ? '가입' : '로그인'} 링크를 보냈습니다.`,
      );
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '로그인에 실패했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="font-cute text-3xl">{copy.title}</h1>
      <p className="text-sm text-ink-2 break-keep">{copy.lead}</p>

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
              {mode === 'signup' ? '이메일로 가입하기' : '이메일로 로그인'}
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
                {mode === 'signup' ? '가입 링크 받기' : '로그인 링크 받기'}
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

      <p className="text-sm text-ink-2">
        {mode === 'signup' ? '이미 선수 등록을 했나요? ' : '야구왕이 처음인가요? '}
        <Link href={otherHref} className="font-semibold underline" style={{ color: 'var(--ink-1)' }}>
          {mode === 'signup' ? '로그인' : '가입하기'}
        </Link>
      </p>

      <p className="text-xs text-ink-2">
        계속하면 이용약관과 개인정보 처리방침에 동의하는 것으로 봅니다. (문서 링크는
        단계 8에서 연결합니다.)
      </p>
    </main>
  );
}
