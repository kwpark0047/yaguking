import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/api/errors';
import { fail, handle, ok } from '@/lib/api/respond';
import { submitAtBatSchema } from '@/lib/schemas/play';
import { resolveOwner } from '@/server/auth/resolveOwner';
import { submitAtBat } from '@/server/play/submitAtBat';
import { enforceRateLimit, SUBMIT_AT_BAT_RULE } from '@/server/security/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 타석 제출.
 *
 * 마감 초과는 서버가 이미 아웃으로 **확정한 뒤** 422로 알린다. 트랜잭션은
 * 커밋되어 있으므로 클라이언트는 응답의 detail로 화면을 맞추면 된다
 * (09 문서 §3.1).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async (requestId) => {
    // 사람이 낼 수 없는 속도만 걸러낸다. 정상 플레이는 넉넉히 통과한다.
    await enforceRateLimit(request, SUBMIT_AT_BAT_RULE);

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = submitAtBatSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'sequence, optionId, submissionId를 확인해 주세요.',
      );
    }

    const { owner } = await resolveOwner(request);
    const result = await submitAtBat(id, parsed.data, owner);

    if (result.outcome === 'deadline_exceeded') {
      return fail(new ApiError('ANSWER_DEADLINE_EXCEEDED', undefined, result), requestId);
    }

    return ok(result);
  });
}
