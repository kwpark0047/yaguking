import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { sanitizeReturnTo, withFlag } from '@/lib/auth/returnTo';
import { claimGuestSessions } from '@/server/auth/claimGuest';
import { readGuestTokenHash } from '@/server/auth/resolveOwner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * OAuth / 매직링크 복귀 지점.
 *
 *   1) 인증 코드를 세션으로 교환하고 쿠키에 심는다
 *   2) **게스트 기록을 승계한다** (멱등)
 *   3) 원래 보던 화면으로 되돌린다 — 결과 화면이면 적립 결과가 바로 보인다
 *
 * returnTo는 내부 경로만 허용한다(오픈 리다이렉트 차단).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo'));
  const authError = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  if (authError) {
    return NextResponse.redirect(
      new URL(withFlag('/auth', 'error', authError), url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(withFlag('/auth', 'error', '인증 코드가 없습니다.'), url.origin),
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.redirect(
      new URL(withFlag('/auth', 'error', 'Auth 공급자가 설정되지 않았습니다.'), url.origin),
    );
  }

  // 세션 쿠키를 심을 응답을 먼저 만들고, 그 응답에 쿠키를 쓴다.
  const response = NextResponse.redirect(new URL(returnTo, url.origin));

  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(
      new URL(withFlag('/auth', 'error', '로그인을 완료하지 못했습니다.'), url.origin),
    );
  }

  // ── 게스트 기록 승계 ──────────────────────────────────────────────
  // 실패해도 로그인 자체는 성공시킨다. 재시도는 /api/v1/auth/claim-guest.
  let claimed = false;
  try {
    const tokenHash = await readGuestTokenHash(request);
    if (tokenHash) {
      const result = await claimGuestSessions(data.user.id, tokenHash);
      claimed = result.claimedSessions > 0;
    }
  } catch {
    claimed = false;
  }

  const destination = claimed ? withFlag(returnTo, 'claimed', '1') : returnTo;
  const final = NextResponse.redirect(new URL(destination, url.origin));
  for (const cookie of response.cookies.getAll()) {
    final.cookies.set(cookie);
  }
  return final;
}
