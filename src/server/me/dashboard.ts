import { getDb } from '@/lib/db/sql';
import { levelName } from '@/lib/game/labels';
import { getCareerBatting } from '@/server/stats/batting';
import type { DashboardDto, RecentGameDto } from '@/types/api';

/** V06 대시보드 "덕아웃" (08 문서). */
export async function getDashboard(userId: string): Promise<DashboardDto> {
  const db = getDb();

  const [profile] = await db<
    { nickname: string; onboarding_status: string; team_name: string | null }[]
  >`
    select p.nickname, p.onboarding_status, t.canonical_name as team_name
      from public.profiles p
      left join public.teams t on t.id = p.primary_team_id
     where p.id = ${userId}
  `;

  const [stats] = await db<{ total_xp: string; level: number }[]>`
    select total_xp::text as total_xp, level
      from public.user_private_stats
     where user_id = ${userId}
  `;

  const recent = await db<
    { id: string; mode: string; runs: number; ended_at: Date | null }[]
  >`
    select id, mode, runs, ended_at
      from public.play_sessions
     where user_id = ${userId}
       and status = 'finished'
     order by ended_at desc
     limit 5
  `;

  const level = stats?.level ?? 1;

  const recentGames: RecentGameDto[] = recent.map((row) => ({
    sessionId: row.id,
    mode: row.mode,
    runs: row.runs,
    endedAt: row.ended_at ? row.ended_at.toISOString() : null,
  }));

  return {
    nickname: profile?.nickname ?? '게스트',
    level,
    levelName: levelName(level),
    totalXp: Number(stats?.total_xp ?? '0'),
    primaryTeamName: profile?.team_name ?? null,
    onboardingComplete: profile?.onboarding_status === 'completed',
    career: await getCareerBatting(db, userId),
    recentGames,
  };
}
