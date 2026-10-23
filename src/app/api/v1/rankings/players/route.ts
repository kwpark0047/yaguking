import type { NextRequest } from 'next/server';
import { handle, ok } from '@/lib/api/respond';
import { getRanking } from '@/server/stats/rankings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 공개 랭킹. 비율/볼륨 탭을 분리해 제공한다. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const kind = request.nextUrl.searchParams.get('kind') === 'volume' ? 'volume' : 'rate';
    return ok(await getRanking(kind));
  });
}
