import { handle, ok } from '@/lib/api/respond';
import { getDb } from '@/lib/db/sql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 구단 목록. 온보딩 2단계의 대표 구단 선택에 쓴다.
 * 구단은 **텍스트 명칭만** 다룬다. 로고·공식 컬러는 권리 검토 전까지 쓰지 않는다.
 */
export async function GET() {
  return handle(async () => {
    const db = getDb();
    const teams = await db<{ id: string; slug: string; short_name: string; canonical_name: string }[]>`
      select id, slug, short_name, canonical_name
        from public.teams
       order by canonical_name
    `;

    return ok(
      teams.map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.canonical_name,
        shortName: t.short_name,
      })),
    );
  });
}
