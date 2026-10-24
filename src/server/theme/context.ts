import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '@/lib/db/sql';
import { getAuthUserId } from '@/lib/supabase/server';
import { isTeamSlug, type TeamSlug } from '@/lib/theme/teams';
import { teamThemesEnabled } from '@/lib/theme/themeSwitch';

/**
 * 지금 화면에 입힐 테마를 정한다 (자동 적용 규칙).
 *
 *   비회원                  → 브랜드 기본(잔디·노랑), 등급 없음
 *   회원, 대표 구단 없음     → 브랜드 기본 + 내 등급
 *   회원, 대표 구단 있음     → 내 구단 + 내 등급
 *   TEAM_THEMES=off         → 구단만 끄고 등급은 유지
 *
 * 화면별 예외(공유 카드는 만든 사람의 구단, 랭킹은 각 행의 구단)는 각 화면이
 * 범위를 좁혀 다시 지정한다. 여기서는 **보는 사람 기준의 기본값**만 정한다.
 *
 * 루트 레이아웃이 모든 화면에서 부른다. 그래서 두 가지를 지킨다.
 *   1) 요청 안에서 한 번만 조회한다(`cache`). 페이지도 같은 값을 쓴다.
 *   2) **어떤 이유로도 던지지 않는다.** 테마 때문에 화면이 죽으면 안 된다.
 *      DB가 안 되면 브랜드 기본으로 떨어진다.
 */
export interface ThemeContext {
  teamSlug: TeamSlug | null;
  /** 비회원이면 null */
  level: number | null;
}

const GUEST: ThemeContext = { teamSlug: null, level: null };

export const getThemeContext = cache(async (): Promise<ThemeContext> => {
  try {
    const userId = await getAuthUserId();
    if (!userId) return GUEST;

    const db = getDb();
    const [row] = await db<{ slug: string | null; level: number }[]>`
      select t.slug, coalesce(s.level, 1) as level
        from public.profiles p
        left join public.teams t on t.id = p.primary_team_id
        left join public.user_private_stats s on s.user_id = p.id
       where p.id = ${userId}
    `;

    const slug = row?.slug;
    return {
      teamSlug: teamThemesEnabled() && isTeamSlug(slug) ? slug : null,
      level: row?.level ?? 1,
    };
  } catch (error) {
    // Next 내부 신호는 삼키면 안 된다. `cookies()`는 정적 생성 중에 "이 화면은
    // 동적이다"를 알리려고 특수 오류를 던진다. 처음에는 이것까지 잡아서, 빌드가
    // /_not-found를 **비회원 테마로 정적 생성**했다(빌드 로그에 이 경고로 찍혔다).
    unstable_rethrow(error);
    console.warn(
      '[theme] 테마 조회 실패, 기본 테마로 표시:',
      error instanceof Error ? error.message : 'unknown',
    );
    return GUEST;
  }
});
