import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import {
  createGuestCookieValue,
  GUEST_COOKIE_NAME,
  hashGuestToken,
  verifyGuestCookieValue,
} from '@/lib/guest/token';
import { getAuthUserId } from '@/lib/supabase/server';
import type { Owner } from '@/server/play/owner';

export interface ResolvedOwner {
  owner: Owner;
  /** 새로 발급해야 하는 게스트 쿠키 값. 있으면 응답에 심는다. */
  newGuestCookie?: string;
}

/**
 * 요청의 소유자를 정한다. 회원이 우선이고, 아니면 게스트다.
 *
 * 게스트 쿠키가 없거나 서명이 깨졌으면 새로 발급한다. 위조된 토큰으로는
 * DB를 조회하지 않는다 (서명 검증 실패 시 바로 새 토큰).
 */
export async function resolveOwner(request: NextRequest): Promise<ResolvedOwner> {
  const userId = await getAuthUserId();
  if (userId) {
    return { owner: { kind: 'user', userId } };
  }

  const cookieValue = request.cookies.get(GUEST_COOKIE_NAME)?.value;
  const verified = await verifyGuestCookieValue(cookieValue);

  if (verified) {
    return { owner: { kind: 'guest', tokenHash: await hashGuestToken(verified) } };
  }

  const fresh = await createGuestCookieValue();
  const id = fresh.slice(0, fresh.lastIndexOf('.'));
  return {
    owner: { kind: 'guest', tokenHash: await hashGuestToken(id) },
    newGuestCookie: fresh,
  };
}

/**
 * 게스트 토큰 해시만 꺼낸다.
 *
 * 승계는 "로그인한 사용자 + 그 브라우저의 게스트 토큰"이 동시에 필요하므로
 * 소유자 판정(회원 우선)과 별개로 쓴다.
 */
export async function readGuestTokenHash(
  request?: NextRequest,
): Promise<string | null> {
  const raw = request
    ? request.cookies.get(GUEST_COOKIE_NAME)?.value
    : (await cookies()).get(GUEST_COOKIE_NAME)?.value;

  const verified = await verifyGuestCookieValue(raw);
  return verified ? hashGuestToken(verified) : null;
}

/**
 * 서버 컴포넌트용. 쿠키는 proxy.ts가 이미 심어 두었다고 가정한다.
 *
 * 서버 컴포넌트는 쿠키를 설정할 수 없으므로, 유효한 게스트 쿠키가 없으면
 * null을 돌려준다. 호출자는 클라이언트에서 세션을 시작하도록 대체 UI를 띄운다.
 */
export async function resolveOwnerFromCookies(): Promise<Owner | null> {
  const userId = await getAuthUserId();
  if (userId) return { kind: 'user', userId };

  const cookieStore = await cookies();
  const verified = await verifyGuestCookieValue(
    cookieStore.get(GUEST_COOKIE_NAME)?.value,
  );
  if (!verified) return null;

  return { kind: 'guest', tokenHash: await hashGuestToken(verified) };
}
