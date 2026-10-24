import { handle, ok } from '@/lib/api/respond';
import { getDb } from '@/lib/db/sql';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 구단 목록. 온보딩 2단계와 설정의 대표 구단 선택에 쓴다.
 *
 * 구단은 명칭(사실 정보)과 `slug`만 내려준다. 화면 테마색은 클라이언트가
 * `slug`로 `src/lib/theme/teams.ts`에서 도출한다 — 구단을 연상시키는 자체
 * 근사치이며 공식 브랜드 값이 아니다. 로고·엠블럼은 쓰지 않는다.
 * 테마는 권리 검토 결과에 따라 `TEAM_THEMES=off`로 끌 수 있다(11 문서 §4).
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
