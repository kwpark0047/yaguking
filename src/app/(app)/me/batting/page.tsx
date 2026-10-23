import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { BattingToggle } from '@/components/me/BattingToggle';
import { getDb } from '@/lib/db/sql';
import { getAuthUserId } from '@/lib/supabase/server';
import { getCareerBatting } from '@/server/stats/batting';
import { RATE_MIN_PA } from '@/server/stats/rankings';
import type { CareerBattingDto } from '@/types/api';

/**
 * V08 내 기록.
 * 통산 / 진행 중 시즌을 토글한다. 비율 지표 랭킹의 최소 타석 조건을 명시한다.
 */
export const dynamic = 'force-dynamic';

export default async function BattingPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect('/auth?returnTo=/me/batting');

  const db = getDb();
  const career = await getCareerBatting(db, userId);

  const [seasonRow] = await db<
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
  const season: CareerBattingDto | null = seasonRow
    ? {
        pa: seasonRow.pa,
        ab: seasonRow.ab,
        h: seasonRow.h,
        hr: seasonRow.hr,
        bb: seasonRow.bb,
        so: seasonRow.so,
        r: seasonRow.r,
        avg: toNumber(seasonRow.avg),
        obp: toNumber(seasonRow.obp),
        slg: toNumber(seasonRow.slg),
        ops: toNumber(seasonRow.ops),
      }
    : null;

  const remaining = Math.max(0, RATE_MIN_PA - (career?.pa ?? 0));

  return (
    <AppShell active="me">
      <main className="flex flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-bold">내 기록</h1>

        <BattingToggle career={career} season={season} />

        <p className="text-xs text-ink-2">
          {remaining > 0
            ? `비율 지표 랭킹에 오르려면 통산 ${RATE_MIN_PA}타석이 필요합니다. ${remaining}타석 남았습니다.`
            : `통산 ${RATE_MIN_PA}타석을 넘겨 비율 지표 랭킹 대상입니다.`}
        </p>

        <section className="rounded-card border border-dashed p-4" style={{ borderColor: 'var(--line)' }}>
          <h2 className="text-sm font-semibold text-ink-2">스카우팅 리포트</h2>
          <p className="mt-1 text-xs text-ink-2">
            5툴 등급과 스트라이크존 약점 맵은 P2에서 공개됩니다. 지금도 타석마다
            자료는 쌓이고 있습니다.
          </p>
        </section>

        <Link href="/settings" className="text-sm text-ink-2 underline">
          설정
        </Link>
      </main>
    </AppShell>
  );
}
