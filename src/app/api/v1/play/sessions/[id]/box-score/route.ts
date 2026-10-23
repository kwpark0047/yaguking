import type { NextRequest } from 'next/server';
import { handle, ok } from '@/lib/api/respond';
import { resolveOwner } from '@/server/auth/resolveOwner';
import { getBoxScore } from '@/server/play/getState';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 박스스코어. 결과 화면과 공유 카드가 함께 쓴다. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const { owner } = await resolveOwner(request);
    return ok(await getBoxScore(id, owner));
  });
}
