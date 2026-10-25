import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { handle, ok } from '@/lib/api/respond';
import { getDb } from '@/lib/db/sql';
import { getAuthUserId } from '@/lib/supabase/server';
import { claimGuestSessions } from '@/server/auth/claimGuest';
import { readGuestTokenHash } from '@/server/auth/resolveOwner';
import { deleteAccount } from '@/server/me/account';
import { confirmAge } from '@/server/me/age';
import { CLAIM_GUEST_RULE, enforceRateLimit } from '@/server/security/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ over14: z.boolean() });

/**
 * 만 14세 확인 (src/server/me/age.ts, 15 문서 §3).
 *
 *   over14 = true  → 확인 시각을 남기고, 미뤄 둔 **비회원 기록 승계**를 한다
 *   over14 = false → 계정과 기록을 즉시 지운다. 비회원 기록은 승계하지 않았으므로
 *                    비회원 기록으로 남고, 비회원 보관 기간(30일)을 따른다
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    await enforceRateLimit(request, CLAIM_GUEST_RULE);

    const userId = await getAuthUserId();
    if (!userId) throw new ApiError('UNAUTHORIZED');

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new ApiError('VALIDATION_ERROR', '나이 확인 값을 확인해 주세요.');

    if (!parsed.data.over14) {
      await deleteAccount(userId);
      return ok({ deleted: true as const });
    }

    await confirmAge(getDb(), userId);

    // 승계는 실패해도 확인 자체는 성공이다. 재시도는 /api/v1/auth/claim-guest.
    let claimed = false;
    try {
      const tokenHash = await readGuestTokenHash(request);
      if (tokenHash) claimed = (await claimGuestSessions(userId, tokenHash)).claimedSessions > 0;
    } catch {
      claimed = false;
    }

    return ok({ confirmed: true as const, claimed });
  });
}
