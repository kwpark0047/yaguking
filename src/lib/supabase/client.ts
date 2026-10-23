'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Auth 공급자 설정이 끝났는지. 미설정이면 화면에서 안내만 한다. */
export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * 실제로 활성화된 소셜 공급자만 노출한다 (08 문서 V04).
 * 설정되지 않은 버튼을 띄우면 누른 사람이 막다른 길에 빠진다.
 */
export function enabledOAuthProviders(): ('google' | 'kakao')[] {
  const raw = process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? '';
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value): value is 'google' | 'kakao' => value === 'google' || value === 'kakao');
}

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Supabase 환경변수가 설정되지 않았습니다.');
  }
  return createBrowserClient(url, anonKey);
}
