import type { NextRequest } from 'next/server';
import { handle, ok } from '@/lib/api/respond';
import { resolveOwner } from '@/server/auth/resolveOwner';
import { abandonSession } from '@/server/play/getState';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 중도 종료. 기록은 남고 공식 집계에는 들어가지 않는다. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const { id } = await params;
    const { owner } = await resolveOwner(request);
    return ok(await abandonSession(id, owner));
  });
}
