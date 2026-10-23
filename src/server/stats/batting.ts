import type { Queryable } from '@/lib/db/types';
import type { BoxScore } from '@/lib/engine';

/**
 * 통산·시즌 성적에 박스스코어를 더한다.
 *
 * 공식 경기 종료와 게스트 기록 승계가 같은 경로를 쓴다.
 *
 * `season_id`가 null인 통산 행은 UNIQUE(user_id, season_id)로는 충돌이 잡히지
 * 않는다(NULL은 서로 다른 값). 부분 유니크 인덱스를 추론하도록
 * `on conflict (user_id) where season_id is null`을 쓴다.
 */
export async function addBattingStats(
  tx: Queryable,
  userId: string,
  box: BoxScore,
): Promise<void> {
  if (box.pa === 0) return;

  await tx`
    insert into public.user_batting_stats (
      user_id, season_id, pa, ab, h, d2, d3, hr, bb, so, r
    )
    values (
      ${userId}, null, ${box.pa}, ${box.ab}, ${box.h},
      ${box.d2}, ${box.d3}, ${box.hr}, ${box.bb}, ${box.so}, ${box.r}
    )
    on conflict (user_id) where season_id is null do update set
      pa = user_batting_stats.pa + excluded.pa,
      ab = user_batting_stats.ab + excluded.ab,
      h  = user_batting_stats.h  + excluded.h,
      d2 = user_batting_stats.d2 + excluded.d2,
      d3 = user_batting_stats.d3 + excluded.d3,
      hr = user_batting_stats.hr + excluded.hr,
      bb = user_batting_stats.bb + excluded.bb,
      so = user_batting_stats.so + excluded.so,
      r  = user_batting_stats.r  + excluded.r,
      updated_at = now()
  `;

  const [season] = await tx<{ id: string }[]>`
    select id from public.seasons where status = 'active' limit 1
  `;
  if (!season) return;

  await tx`
    insert into public.user_batting_stats (
      user_id, season_id, pa, ab, h, d2, d3, hr, bb, so, r
    )
    values (
      ${userId}, ${season.id}, ${box.pa}, ${box.ab}, ${box.h},
      ${box.d2}, ${box.d3}, ${box.hr}, ${box.bb}, ${box.so}, ${box.r}
    )
    on conflict (user_id, season_id) do update set
      pa = user_batting_stats.pa + excluded.pa,
      ab = user_batting_stats.ab + excluded.ab,
      h  = user_batting_stats.h  + excluded.h,
      d2 = user_batting_stats.d2 + excluded.d2,
      d3 = user_batting_stats.d3 + excluded.d3,
      hr = user_batting_stats.hr + excluded.hr,
      bb = user_batting_stats.bb + excluded.bb,
      so = user_batting_stats.so + excluded.so,
      r  = user_batting_stats.r  + excluded.r,
      updated_at = now()
  `;
}

export interface CareerBatting {
  pa: number;
  ab: number;
  h: number;
  hr: number;
  bb: number;
  so: number;
  r: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
}

/** 통산 성적 (season_id is null). 비율 지표는 DB 뷰가 계산한다. */
export async function getCareerBatting(
  tx: Queryable,
  userId: string,
): Promise<CareerBatting | null> {
  const [row] = await tx<
    {
      pa: number;
      ab: number;
      h: number;
      hr: number;
      bb: number;
      so: number;
      r: number;
      avg: string | null;
      obp: string | null;
      slg: string | null;
      ops: string | null;
    }[]
  >`
    select pa, ab, h, hr, bb, so, r, avg, obp, slg, ops
      from public.v_user_batting_rates
     where user_id = ${userId}
       and season_id is null
  `;

  if (!row) return null;

  const toNumber = (value: string | null): number | null =>
    value === null ? null : Number(value);

  return {
    pa: row.pa,
    ab: row.ab,
    h: row.h,
    hr: row.hr,
    bb: row.bb,
    so: row.so,
    r: row.r,
    avg: toNumber(row.avg),
    obp: toNumber(row.obp),
    slg: toNumber(row.slg),
    ops: toNumber(row.ops),
  };
}
