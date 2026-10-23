import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { handle, ok } from '@/lib/api/respond';
import { getAuthUserId } from '@/lib/supabase/server';
import { deleteAccount } from '@/server/me/account';
import { getMe, updateProfile } from '@/server/me/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  nickname: z.string().min(1).max(32).optional(),
  primaryTeamId: z.uuid().nullable().optional(),
});

/**
 * 삭제는 되돌릴 수 없으므로 **본인 닉네임을 정확히 입력**해야 진행한다.
 * 실수로 호출되는 경로를 하나라도 줄인다.
 */
const deleteSchema = z.object({
  confirmNickname: z.string().min(1),
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

/** 계정 삭제. 되돌릴 수 없다. */
export async function DELETE(request: Request) {
  return handle(async () => {
    const userId = await getAuthUserId();
    if (!userId) throw new ApiError('UNAUTHORIZED');

    const body = await request.json().catch(() => ({}));
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_ERROR', '닉네임을 입력해 주세요.');
    }

    const me = await getMe(userId);
    if (!me.profile) throw new ApiError('NOT_FOUND', '프로필이 없습니다.');

    if (parsed.data.confirmNickname.trim() !== me.profile.nickname) {
      throw new ApiError('VALIDATION_ERROR', '닉네임이 일치하지 않습니다.');
    }

    return ok(await deleteAccount(userId));
  });
}
