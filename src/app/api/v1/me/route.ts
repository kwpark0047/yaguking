import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { handle, ok } from '@/lib/api/respond';
import { getAuthUserId } from '@/lib/supabase/server';
import { getMe, updateProfile } from '@/server/me/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  nickname: z.string().min(1).max(32).optional(),
  primaryTeamId: z.uuid().nullable().optional(),
});

export async function GET() {
  return handle(async () => {
    const userId = await getAuthUserId();
    if (!userId) throw new ApiError('UNAUTHORIZED');
    return ok(await getMe(userId));
  });
}

/** 온보딩 2단계(닉네임 + 대표 구단) 저장에 쓴다. */
export async function PATCH(request: Request) {
  return handle(async () => {
    const userId = await getAuthUserId();
    if (!userId) throw new ApiError('UNAUTHORIZED');

    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', '닉네임 또는 구단 값을 확인해 주세요.');
    }

    return ok(await updateProfile(userId, parsed.data));
  });
}
