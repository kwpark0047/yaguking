import { NextResponse, type NextRequest } from 'next/server';
import {
  createGuestCookieValue,
  GUEST_COOKIE_MAX_AGE,
  GUEST_COOKIE_NAME,
  hasGuestSecret,
  verifyGuestCookieValue,
} from '@/lib/guest/token';

/**
 * 게스트 쿠키를 보장한다.
 *
 * Next 16부터 미들웨어 파일은 `proxy.ts`, 내보내는 함수는 `proxy`다.
 * (`middleware.ts`는 deprecated)
 *
 * DB 행은 만들지 않는다 — 첫 경기 시작 시점에 서버에서 지연 생성한다.
 * 여기서는 서명된 토큰이 쿠키에 있게만 한다. 랜딩 페이지가 0탭으로
 * 첫 타석을 띄울 때 토큰이 이미 있어야 하기 때문이다 (08 문서 §3).
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // 프록시에서 예외를 던지면 에러 페이지까지 포함해 모든 라우트가 죽는다.
  // 키가 없으면 경고만 남기고 통과시킨다. 실제로 게스트 세션이 필요한
  // 라우트 핸들러가 사람이 읽을 수 있는 오류로 알려 준다.
  if (!hasGuestSecret()) {
    console.warn(
      'GUEST_TOKEN_SECRET이 설정되지 않아 게스트 쿠키를 발급하지 않습니다. .env.local을 확인하세요.',
    );
    return response;
  }

  const existing = request.cookies.get(GUEST_COOKIE_NAME)?.value;
  const verified = await verifyGuestCookieValue(existing);

  if (!verified) {
    response.cookies.set({
      name: GUEST_COOKIE_NAME,
      value: await createGuestCookieValue(),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GUEST_COOKIE_MAX_AGE,
    });
  }

  return response;
}

export const config = {
  matcher: [
    // 정적 자산과 이미지 최적화 경로는 건너뛴다.
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
