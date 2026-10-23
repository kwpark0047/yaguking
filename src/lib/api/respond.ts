import { NextResponse } from 'next/server';
import { ApiError } from './errors';

/** 응답 규격: { success: true, data } | { success: false, error } (03 문서 머리말) */

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status, headers: NO_STORE });
}

export function fail(error: ApiError, requestId: string): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        requestId,
        ...(error.detail === undefined ? {} : { detail: error.detail }),
      },
    },
    { status: error.status, headers: NO_STORE },
  );
}

/**
 * 라우트 핸들러 공통 래퍼.
 * 로그에는 requestId와 코드만 남긴다. 토큰·쿠키·개인정보를 기록하지 않는다
 * (09 문서 §8).
 */
export async function handle(
  fn: (requestId: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  const requestId = `req_${crypto.randomUUID()}`;
  try {
    return await fn(requestId);
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status >= 500) {
        console.error(`[${requestId}] ${error.code}`);
      }
      return fail(error, requestId);
    }
    console.error(
      `[${requestId}] UNHANDLED`,
      error instanceof Error ? error.message : 'unknown',
    );
    return fail(new ApiError('INTERNAL_ERROR'), requestId);
  }
}
