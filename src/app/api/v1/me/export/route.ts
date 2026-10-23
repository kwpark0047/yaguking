import { ApiError } from '@/lib/api/errors';
import { handle } from '@/lib/api/respond';
import { getAuthUserId } from '@/lib/supabase/server';
import { exportAccountData } from '@/server/me/account';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 내 데이터 내보내기. 파일로 받도록 Content-Disposition 을 붙인다.
 * 본인 데이터만 담으며 다른 회원의 정보는 포함하지 않는다.
 */
export async function GET() {
  return handle(async () => {
    const userId = await getAuthUserId();
    if (!userId) throw new ApiError('UNAUTHORIZED');

    const data = await exportAccountData(userId);
    const date = data.exportedAt.slice(0, 10);

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="yaguking-data-${date}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
