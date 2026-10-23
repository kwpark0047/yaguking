import { ApiError } from '@/lib/api/errors';
import { handle, ok } from '@/lib/api/respond';
import { getDb } from '@/lib/db/sql';
import { getAuthUserId } from '@/lib/supabase/server';
import { getCareerBatting } from '@/server/stats/batting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 통산 / 진행 중 시즌 성적. 화면의 토글이 둘 다 쓴다. */
export async function GET() {
  return handle(async () => {
    const userId = await getAuthUserId();
    if (!userId) throw new ApiError('UNAUTHORIZED');

    const db = getDb();
    const career = await getCareerBatting(db, userId);

    const [season] = await db<
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
      select v.pa, v.ab, v.h, v.hr, v.bb, v.so, v.r, v.avg, v.obp, v.slg, v.ops
        from public.v_user_batting_rates v
        join public.seasons s on s.id = v.season_id and s.status = 'active'
       where v.user_id = ${userId}
    `;

    const toNumber = (value: string | null) => (value === null ? null : Number(value));

    return ok({
      career,
      season: season
        ? {
            pa: season.pa,
            ab: season.ab,
            h: season.h,
            hr: season.hr,
            bb: season.bb,
            so: season.so,
            r: season.r,
            avg: toNumber(season.avg),
            obp: toNumber(season.obp),
            slg: toNumber(season.slg),
            ops: toNumber(season.ops),
          }
        : null,
    });
  });
}
