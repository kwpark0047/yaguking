import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 로그아웃.
 *
 * 폼 POST로만 받는다. 링크(GET)로 열 수 있으면 다른 사이트가 이미지 태그
 * 하나로 사용자를 로그아웃시킬 수 있다. 같은 이유로 다른 출처에서 온 요청은
 * 거절한다.
 *
 * 세션 쿠키만 지운다. 게스트 쿠키는 두므로, 로그아웃한 뒤 플레이하면 새
 * 비회원 기록으로 쌓인다.
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) {
    return new NextResponse('다른 출처의 로그아웃 요청은 받지 않습니다.', { status: 403 });
  }

  // 303: POST 뒤에 메인 페이지를 GET으로 연다.
  const response = NextResponse.redirect(new URL('/', url.origin), 303);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return response;

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

  const { error } = await supabase.auth.signOut();
  if (error) {
    // 토큰은 남기지 않는다. 원인만 기록한다.
    console.error(`[auth/signout] 로그아웃 실패: ${error.code ?? 'unknown'} / ${error.message}`);
  }
  return response;
}
