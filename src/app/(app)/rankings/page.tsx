import Link from 'next/link';
import { AppShell } from '@/components/shell/AppShell';
import { getRanking } from '@/server/stats/rankings';
import { levelName } from '@/lib/game/labels';
import type { RankingKind } from '@/types/api';

/**
 * V15 랭킹.
 *
 * 비율(통산 OPS, 최소 50타석)과 볼륨(시즌 누적 득점)을 **분리한다**.
 * 각 탭에 산출 기준과 집계 시각을 명시한다 (08 문서 V15).
 * RP 탭은 P3 전까지 노출하지 않는다.
 */
export const dynamic = 'force-dynamic';

const TABS: { kind: RankingKind; label: string }[] = [
  { kind: 'rate', label: '비율 (OPS)' },
  { kind: 'volume', label: '볼륨 (득점)' },
];

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const params = await searchParams;
  const kind: RankingKind = params.kind === 'volume' ? 'volume' : 'rate';

  let ranking = null;
  try {
    ranking = await getRanking(kind);
  } catch {
    ranking = null;
  }

  return (
    <AppShell active="rankings">
      <main className="flex flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-bold">랭킹</h1>

        <div className="flex gap-2" role="tablist">
          {TABS.map((tab) => (
            <Link
              key={tab.kind}
              href={`/rankings?kind=${tab.kind}`}
              role="tab"
              aria-selected={tab.kind === kind}
              className="flex min-h-11 flex-1 items-center justify-center rounded-option border text-sm"
              style={{
                borderColor: tab.kind === kind ? 'var(--accent)' : 'var(--line)',
                fontWeight: tab.kind === kind ? 600 : 400,
              }}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {!ranking ? (
          <p className="text-sm text-ink-2">랭킹을 불러오지 못했습니다.</p>
        ) : (
          <>
            <p className="text-xs text-ink-2">
              기준: {ranking.criterion} · 집계{' '}
              {new Date(ranking.computedAt).toLocaleString('ko-KR')}
            </p>

            {ranking.entries.length === 0 ? (
              <p className="text-sm text-ink-2">
                {kind === 'rate'
                  ? `아직 ${ranking.minimumPa}타석을 채운 회원이 없습니다.`
                  : '아직 기록된 득점이 없습니다.'}
              </p>
            ) : (
              <ol className="flex flex-col gap-1">
                {ranking.entries.map((entry) => (
                  <li
                    key={`${entry.rank}-${entry.nickname}`}
                    className="flex items-center gap-3 rounded-option border px-3 py-2"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <span className="num-tabular w-8 text-sm text-ink-2">
                      {entry.rank}
                    </span>
                    <span className="flex-1 truncate">
                      <span className="font-medium">{entry.nickname}</span>
                      <span className="ml-2 text-xs text-ink-2">
                        {levelName(entry.level)}
                      </span>
                    </span>
                    <span className="num-tabular font-semibold">{entry.primary}</span>
                    <span className="num-tabular w-16 text-right text-xs text-ink-2">
                      {entry.secondary}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        <p className="text-xs text-ink-2">
          구단 팬 랭킹은 팬 페넌트레이스(P2)와 함께, RP 랭킹은 P3에 공개됩니다.
        </p>
      </main>
    </AppShell>
  );
}
