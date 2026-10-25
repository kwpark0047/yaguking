import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api/errors';
import { handle, ok } from '@/lib/api/respond';
import { buildBoxScore } from '@/lib/engine';
import { getAuthUserId } from '@/lib/supabase/server';
import { claimGuestSessions } from '@/server/auth/claimGuest';
import { getDb } from '@/lib/db/sql';
import { requireAgeConfirmed } from '@/server/me/age';
import { readGuestTokenHash } from '@/server/auth/resolveOwner';
import { CLAIM_GUEST_RULE, enforceRateLimit } from '@/server/security/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 게스트 기록 승계. 멱등이다 — 두 번 호출해도 중복 적립되지 않는다.
 * 보통은 /auth/callback이 서버에서 직접 호출하고, 이 엔드포인트는 재시도용이다.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    await enforceRateLimit(request, CLAIM_GUEST_RULE);

    const userId = await getAuthUserId();
    if (!userId) throw new ApiError('UNAUTHORIZED');
    // 만 14세 확인 전에는 비회원 기록을 계정에 붙이지 않는다.
    await requireAgeConfirmed(getDb(), userId);

    const tokenHash = await readGuestTokenHash(request);
    if (!tokenHash) {
      return ok({
        alreadyClaimed: false,
        claimedSessions: 0,
        migrated: buildBoxScore([]),
        career: null,
      });
    }

    return ok(await claimGuestSessions(userId, tokenHash));
  });
}
