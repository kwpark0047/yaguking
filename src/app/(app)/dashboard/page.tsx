import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { formatRate } from '@/lib/engine';
import { MODE_LABEL, levelProgress } from '@/lib/game/labels';
import { getAuthUserId } from '@/lib/supabase/server';
import { getDashboard } from '@/server/me/dashboard';

/** V06 대시보드 "덕아웃". */
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect('/auth?returnTo=/dashboard');

  const data = await getDashboard(userId);
  const progress = levelProgress(data.level, data.totalXp);

  return (
    <AppShell active="home">
      <main className="flex flex-col gap-4 px-4 py-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm text-ink-2">
            {data.primaryTeamName ?? '대표 구단 미설정'}
          </p>
          <h1 className="text-2xl font-bold">{data.nickname}</h1>
          <p className="num-tabular text-sm text-ink-2">
            {data.levelName} · Lv.{data.level} · {data.totalXp} XP
          </p>
          <div
            className="h-2 overflow-hidden rounded-full"
            style={{ backgroundColor: 'var(--line)' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="다음 등급까지 진행률"
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${progress * 100}%`, backgroundColor: 'var(--accent)' }}
            />
          </div>
        </header>

        {!data.onboardingComplete && (
          <Link
            href="/onboarding?returnTo=/dashboard"
            className="rounded-card border p-4 text-sm"
            style={{ borderColor: 'var(--accent)' }}
          >
            대표 구단을 고르면 팬 페넌트레이스에 참가할 수 있습니다 (P2 시작 예정).
          </Link>
        )}

        <Link
          href="/modes"
          className="flex min-h-14 items-center justify-center rounded-option font-semibold"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          오늘의 경기 시작
        </Link>

        <section className="rounded-card border p-4" style={{ borderColor: 'var(--line)' }}>
          <h2 className="mb-2 text-sm font-semibold">통산 성적</h2>
          {data.career && data.career.pa > 0 ? (
            <dl className="grid grid-cols-4 gap-2 text-center">
              {[
                ['타석', String(data.career.pa)],
                ['안타', String(data.career.h)],
                ['타율', formatRate(data.career.avg)],
                ['OPS', formatRate(data.career.ops)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-option bg-bg-field p-2">
                  <dt className="text-xs text-ink-2">{label}</dt>
                  <dd className="num-tabular font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-ink-2">아직 공식 기록이 없습니다.</p>
          )}
        </section>

        <section className="rounded-card border p-4" style={{ borderColor: 'var(--line)' }}>
          <h2 className="mb-2 text-sm font-semibold">최근 경기</h2>
          {data.recentGames.length === 0 ? (
            <p className="text-sm text-ink-2">기록된 경기가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.recentGames.map((game) => (
                <li key={game.sessionId}>
                  <Link
                    href={`/play/${game.sessionId}/result`}
                    className="flex min-h-11 items-center justify-between text-sm"
                  >
                    <span className="text-ink-2">
                      {MODE_LABEL[game.mode] ?? game.mode}
                    </span>
                    <span className="num-tabular font-semibold">{game.runs}득점</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
