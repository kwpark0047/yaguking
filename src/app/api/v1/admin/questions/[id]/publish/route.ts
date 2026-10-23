import { ApiError } from '@/lib/api/errors';
import { handle, ok } from '@/lib/api/respond';
import { getAuthUserId } from '@/lib/supabase/server';
import { assertAdmin, publishQuestion } from '@/server/admin/questions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 게시 승인. 보기 4개·정답 1개·출처 1건은 DB 트리거가 최종 검증한다.
 * 자동 생성 문항이라도 이 경로를 통과해야만 출제된다.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const userId = await getAuthUserId();
    if (!userId) throw new ApiError('UNAUTHORIZED');
    await assertAdmin(userId);

    const { id } = await params;
    await publishQuestion(id, userId);
    return ok({ id, status: 'published' });
  });
}
