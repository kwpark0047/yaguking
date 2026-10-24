import { getDb } from '@/lib/db/sql';
import type { RankingDto, RankingKind } from '@/types/api';

/**
 * 랭킹 (06 문서 §9).
 *
 * 비율과 볼륨을 **분리한다**. 하나로 합치면 "많이 한 사람"과 "잘하는 사람"이
 * 섞여 둘 다 의미를 잃는다.
 *
 *   - rate   : 통산 OPS. 표본이 적으면 운이 지배하므로 **최소 50타석**.
 *   - volume : 시즌 누적 득점.
 *
 * 랭킹은 서버에서만 만든다. `leaderboard_entries`와 원본 테이블 모두
 * 클라이언트 접근이 막혀 있어(0009/0010) 최소 조건을 우회할 수 없다.
 */

export const RATE_MIN_PA = 50;

export async function getRanking(
  kind: RankingKind,
  limit = 50,
): Promise<RankingDto> {
  const db = getDb();

  if (kind === 'rate') {
    const rows = await db<
      {
        nickname: string;
        level: number;
        pa: number;
        ops: string | null;
        team_slug: string | null;
        team_short: string | null;
      }[]
    >`
      select p.nickname,
             coalesce(s.level, 1) as level,
             r.pa,
             r.ops,
             t.slug as team_slug,
             t.short_name as team_short
        from public.v_user_batting_rates r
        join public.profiles p on p.id = r.user_id
        left join public.teams t on t.id = p.primary_team_id
        left join public.user_private_stats s on s.user_id = r.user_id
       where r.season_id is null
         and r.pa >= ${RATE_MIN_PA}
         and r.ops is not null
       order by r.ops desc, r.pa desc
       limit ${limit}
    `;

    return {
      kind: 'rate',
      criterion: `통산 OPS · 최소 ${RATE_MIN_PA}타석`,
      minimumPa: RATE_MIN_PA,
      computedAt: new Date().toISOString(),
      entries: rows.map((row, index) => ({
        rank: index + 1,
        nickname: row.nickname,
        level: row.level,
        teamSlug: row.team_slug,
        teamShortName: row.team_short,
        primary: row.ops === null ? '-' : formatRateString(row.ops),
        secondary: `${row.pa}타석`,
      })),
    };
  }

  const rows = await db<
    {
      nickname: string;
      level: number;
      r: number;
      pa: number;
      team_slug: string | null;
      team_short: string | null;
    }[]
  >`
    select p.nickname,
           coalesce(ps.level, 1) as level,
           b.r,
           b.pa,
           t.slug as team_slug,
           t.short_name as team_short
      from public.user_batting_stats b
      join public.seasons se on se.id = b.season_id and se.status = 'active'
      join public.profiles p on p.id = b.user_id
      left join public.teams t on t.id = p.primary_team_id
      left join public.user_private_stats ps on ps.user_id = b.user_id
     order by b.r desc, b.pa asc
     limit ${limit}
  `;

  return {
    kind: 'volume',
    criterion: '진행 중 시즌 누적 득점',
    minimumPa: null,
    computedAt: new Date().toISOString(),
    entries: rows.map((row, index) => ({
      rank: index + 1,
      nickname: row.nickname,
      level: row.level,
      teamSlug: row.team_slug,
      teamShortName: row.team_short,
      primary: `${row.r}득점`,
      secondary: `${row.pa}타석`,
    })),
  };
}

/** `.327` / `1.250` 표기. DB가 numeric 문자열로 돌려준다. */
function formatRateString(value: string): string {
  const numeric = Number(value);
  const fixed = numeric.toFixed(3);
  return Math.abs(numeric) < 1 ? fixed.replace(/^(-?)0/, '$1') : fixed;
}
