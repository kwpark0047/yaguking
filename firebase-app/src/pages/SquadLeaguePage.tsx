import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { SquadLogo } from '@/components/squad/SquadLogo';
import { dayText, kstDate, LEAGUE_REWARDS, LEAGUE_TOP, squadKindName, squadsOpen, squadStart, weekDays, weekStartOf } from '@/lib/squad/squad';
import { loadLeague, type LeagueView } from '@/lib/squad/squadApi';

/**
 * 팀 주간 리그 순위표(3단계) — 운영자 PC 0시 작업이 쓴 squadLeague/{월요일} 한 문서(10분 기억). 이번 주·지난주를 고른다.
 * 팀 점수 = 팀원 상위 5명의 이번 주 오늘의 공식전 점수 평균. 1~3위 팀의 참가 팀원은 보너스 포인트(월요일 0시 확정).
 */
export function SquadLeaguePage() {
  const { user, isGuest, profile } = useAuth();
  const member = !!user && !isGuest && profile.status === 'ready' && profile.ageConfirmed;
  const myCode = profile.status === 'ready' ? profile.data.squad : null;
  const thisWeek = weekStartOf(kstDate(Date.now() - 86_400_000));
  const lastWeek = weekStartOf(kstDate(Date.parse(`${thisWeek}T00:00:00Z`) - 86_400_000));
  const [week, setWeek] = useState(thisWeek);
  const [league, setLeague] = useState<LeagueView | null | undefined>(undefined);
  const open = squadsOpen();

  useEffect(() => {
    if (!open || !member) return;
    setLeague(undefined);
    loadLeague(week)
      .then(setLeague)
      .catch(() => setLeague(null));
  }, [open, member, week]);

  const days = weekDays(week);
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Link to="/team" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 팀
      </Link>
      <h1 className="font-cute text-3xl">팀 주간 리그</h1>
      <p className="text-sm text-ink-2 break-keep">
        팀원 상위 {LEAGUE_TOP}명이 이번 주(월~일)에 푼 오늘의 공식전 점수의 평균으로 순위를 매겨요. 월요일 0시에 지난주가 확정되고, 1~3위 팀에서 그 주에 한 번이라도
        푼 팀원은 보너스 포인트 {LEAGUE_REWARDS.join('·')}P를 받아요.
      </p>
      {!open && <p role="status">팀 리그는 {dayText(squadStart())}부터 열려요.</p>}
      {open && !member && <p role="status">팀 리그는 회원만 볼 수 있어요.</p>}
      {open && member && (
        <>
          <div className="flex gap-2" role="group" aria-label="주 고르기">
            {[
              { id: thisWeek, label: '이번 주' },
              { id: lastWeek, label: '지난주' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={week === item.id}
                onClick={() => setWeek(item.id)}
                className="min-h-11 rounded-option border-2 px-3 text-sm font-semibold"
                style={{ borderColor: week === item.id ? 'var(--accent)' : 'var(--line)' }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-2">
            {dayText(days[0]!)}~{dayText(days[6]!)}
            {league?.final ? ' · 확정' : league?.through ? ` · ${dayText(league.through)}까지` : ''}
          </p>
          {league === undefined && <p className="text-sm text-ink-2">불러오는 중…</p>}
          {league === null && <p className="text-sm text-ink-2">아직 순위가 없어요. 팀원이 오늘의 공식전을 풀면 다음 날 0시에 생겨요.</p>}
          {league && league.rows.length === 0 && <p className="text-sm text-ink-2">아직 점수가 있는 팀이 없어요.</p>}
          {league && league.rows.length > 0 && (
            <ol className="flex flex-col gap-2" aria-label="팀 순위">
              {league.rows.map((row) => (
                <li
                  key={row.code}
                  className="sticker flex items-center gap-3 px-4 py-3"
                  style={row.code === myCode ? { outline: '3px solid var(--accent)' } : undefined}
                >
                  <span className="font-cute w-8 text-center text-2xl">{row.rank}</span>
                  <SquadLogo logo={row.logo} size={44} badge={league.final && row.rank <= 3 ? row.rank : null} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-semibold">
                      {row.name}
                      {row.code === myCode && <span className="text-ink-2"> (우리 팀)</span>}
                    </span>
                    <span className="text-xs text-ink-2">
                      {squadKindName(row.kind)} · {row.players}/{row.size}명 참가
                    </span>
                  </span>
                  <span className="font-cute text-xl">{row.score}</span>
                </li>
              ))}
            </ol>
          )}
          {league && league.count > league.rows.length && <p className="text-xs text-ink-2">상위 {league.rows.length}팀만 보여요(모두 {league.count}팀).</p>}
        </>
      )}
    </main>
  );
}
