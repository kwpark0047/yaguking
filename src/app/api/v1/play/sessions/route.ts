import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api/errors';
import { handle, ok } from '@/lib/api/respond';
import { GUEST_COOKIE_MAX_AGE, GUEST_COOKIE_NAME } from '@/lib/guest/token';
import { startSessionSchema } from '@/lib/schemas/play';
import { resolveOwner } from '@/server/auth/resolveOwner';
import { startSession } from '@/server/play/startSession';
import { scheduleDailyPurge } from '@/server/privacy/purge';
import { enforceRateLimit, START_SESSION_RULE } from '@/server/security/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handle(async () => {
    // 체험 상한은 게스트 토큰 단위라 쿠키를 버리면 우회된다 (11 문서 §3).
    await enforceRateLimit(request, START_SESSION_RULE);

    const body = await request.json().catch(() => ({}));
    const parsed = startSessionSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', '모드 값을 확인해 주세요.');
    }

    const { owner, newGuestCookie } = await resolveOwner(request);
    const result = await startSession(parsed.data, owner);
    // 보관 기간 파기 안전망 — 응답 뒤에 하루 한 번 (src/server/privacy/purge.ts)
    scheduleDailyPurge();

    const response = ok(result, 201);
    if (newGuestCookie) {
      response.cookies.set({
        name: GUEST_COOKIE_NAME,
        value: newGuestCookie,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: GUEST_COOKIE_MAX_AGE,
      });
    }
    return response;
  });
}
