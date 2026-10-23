import type { NextRequest } from 'next/server';
import { handle, ok } from '@/lib/api/respond';
import { resolveOwner } from '@/server/auth/resolveOwner';
import { getPlayState } from '@/server/play/getState';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 경기 상태 복원.
 * 클라이언트는 제출 실패 후 재시도 전에 이 엔드포인트로 확정 여부를 먼저
 * 확인한다 (08 문서 §4.2).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const { owner } = await resolveOwner(request);
    return ok(await getPlayState(id, owner));
  });
}
