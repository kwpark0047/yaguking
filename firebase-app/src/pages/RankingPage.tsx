import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { AttendanceCalendar } from '@/components/engagement/AttendanceCalendar';
import { TEAMS } from '@/content/teams';
import {
  DOUBLE_FACTOR,
  HIDDEN_NAME,
  TEAM_MIN_FANS,
  MONTH_GAMES_GOAL,
  MONTH_XP_GOALS,
  POINTS,
  STREAK_WEEK,
  TITLE_LABEL,
  attendancePoints,
  engagementOpen,
  engagementStart,
  kstDate,
  kstDayOfMonth,
  kstMonthKey,
  monthGoals,
  monthLabel,
  previousMonth,
  rankFromHistogram,
  type Leaderboard,
  type LeaderboardEntry,
  type Title,
} from '@/lib/game/attendance';
import { loadAttendance, loadAward, loadLeaderboard, loadMonthlyPractice, loadOfficialMonth } from '@/lib/game/engagement';
import { OFFICIAL_TOTAL, officialSum } from '@/lib/game/official';

const teamName = (slug: string | null) => TEAMS.find((team) => team.slug === slug)?.shortName ?? '';
const titleColor: Record<Title, string> = { king: 'var(--hr)', allstar: 'var(--accent)', hall: 'var(--on-base)', perfect: 'var(--ink-2)' };

function Titles({ titles }: { titles: readonly Title[] }) {
  return (
    <>
      {titles.map((title) => (
        <span key={title} className="rounded-full border px-2 text-xs font-semibold whitespace-nowrap" style={{ borderColor: titleColor[title], color: 'var(--ink-1)' }}>
          {TITLE_LABEL[title]}
        </span>
      ))}
    </>
  );
}

function Standings({ entries, label }: { entries: readonly LeaderboardEntry[]; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col gap-1">
      {entries.map((entry, index) => (
        <li key={`${entry.rank}-${index}`} className="flex items-center gap-3 rounded-option border px-3 py-2 text-sm" style={{ borderColor: 'var(--line)' }}>
          <span className="font-cute w-10 shrink-0 text-lg">{entry.rank}위</span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold break-all">{entry.nickname}</span>
            {entry.team && <span className="text-xs text-ink-2">{teamName(entry.team)}</span>}
            <Titles titles={entry.titles} />
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-semibold">{entry.points}점</span>
            <span className="block text-xs text-ink-2">
              출석 {entry.days}일{entry.rounds > 0 ? ` · 공식전 ${entry.rounds}회` : ''}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * 월간 등수(docs/engagement-plan.md §4) — 이번 달(어제까지, 운영자 PC가 매일 새벽 계산), 내 이번 달(출석·연습 점수),
 * 지난달 명예의 전당(확정). 읽기: 이번 달 등수 1 + 출석 1(홈에서 읽었으면 0) + 연습 1 + 지난달 등수 1 + 내 칭호 1.
 */
export function RankingPage() {
  const { user, isGuest, profile } = useAuth();
  const [now] = useState(() => Date.now());
  const month = kstMonthKey(now);
  const last = previousMonth(month);
  const today = kstDayOfMonth(now);
  const open = engagementOpen(kstDate(now));
  const member = !!user && !isGuest && profile.status === 'ready' && profile.ageConfirmed;
  const [board, setBoard] = useState<Leaderboard | null | undefined>(undefined);
  const [lastBoard, setLastBoard] = useState<Leaderboard | null>(null);
  const [mine, setMine] = useState<{
    days: number[];
    official: Record<string, number>;
    practice: { games: number; xp: number };
    award: { rank: number; titles: Title[] } | null;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!open || !uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const [current, previous] = await Promise.all([loadLeaderboard(month), loadLeaderboard(last)]);
        const personal = member
          ? await Promise.all([
              loadAttendance(uid, month),
              loadMonthlyPractice(uid, month),
              previous?.final ? loadAward(uid, last) : Promise.resolve(null),
              loadOfficialMonth(uid, month),
            ])
          : null;
        if (cancelled) return;
        setBoard(current);
        setLastBoard(previous?.final ? previous : null);
        if (personal) setMine({ days: personal[0], practice: personal[1], award: personal[2], official: personal[3] });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, uid, member, month, last]);

  const start = engagementStart();
  const doubleDays = board?.doubleDays ?? [];
  const myTeam = profile.status === 'ready' ? (profile.data.favoriteTeams[0] ?? null) : null;
  const myPoints = mine ? attendancePoints(mine.days, month, today, start, doubleDays) : null;
  const myOfficial = mine ? officialSum(mine.official, month) : null;
  const myRank =
    mine && board
      ? rankFromHistogram(
          attendancePoints(mine.days, month, board.through, start, doubleDays).points + officialSum(mine.official, month, board.through).points,
          board.histogram,
        )
      : null;
  const goals = mine ? monthGoals(mine.practice.xp, mine.practice.games) : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-4 py-8">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">월간 등수</h1>

      {!open ? (
        <p className="sticker p-4 text-sm break-keep">
          {Number(start.slice(5, 7))}월 {Number(start.slice(8, 10))}일부터 시작해요. 회원은 하루 한 번 출석 도장을 찍고, 모은 포인트로 이달의 야구왕에 도전해요.
        </p>
      ) : !user ? (
        <p className="sticker flex flex-col gap-2 p-4 text-sm break-keep">
          로그인하면 이번 달 등수를 볼 수 있어요.
          <Link to="/auth?mode=login&returnTo=%2Franking" className="flex min-h-11 items-center font-semibold underline">
            로그인
          </Link>
        </p>
      ) : (
        <>
          {failed && (
            <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
              등수를 불러오지 못했어요. 연결을 확인해 주세요.
            </p>
          )}

          <section aria-labelledby="ranking-current" className="flex flex-col gap-3">
            <h2 id="ranking-current" className="font-cute text-xl">
              {monthLabel(month)} 순위
            </h2>
            {board === undefined && !failed && <p className="text-sm text-ink-2">불러오는 중…</p>}
            {board !== undefined && (
              <p className="text-sm text-ink-2 break-keep">
                {board && board.through > 0
                  ? `${Number(month.slice(4, 6))}월 ${board.through}일까지의 출석·공식전 · 참여 ${board.participants}명 · 매일 새벽 갱신`
                  : '아직 셀 날이 없어요. 등수는 매일 새벽에 어제까지의 출석으로 매겨요.'}
              </p>
            )}
            {myRank?.rank && (
              <p role="status" className="sticker p-3 font-semibold">
                내 순위 {myRank.rank}위 / {myRank.participants}명
              </p>
            )}
            {board && board.top.length > 0 && <Standings entries={board.top} label={`${monthLabel(month)} 상위 ${board.top.length}명`} />}
          </section>

          {member && mine && myPoints && goals ? (
            <section aria-labelledby="ranking-mine" className="sticker flex flex-col gap-3 p-4">
              <h2 id="ranking-mine" className="font-cute text-xl">
                내 이번 달
              </h2>
              <p className="text-sm">
                출석 {myPoints.days}일 · 출석 포인트 <strong>{myPoints.points}점</strong>
                {myPoints.weeks > 0 && ` (7일 연속 보너스 ${myPoints.weeks}번)`}
              </p>
              {myOfficial && (
                <p className="text-sm">
                  오늘의 공식전 {myOfficial.rounds}회 · 공식 점수 <strong>{myOfficial.points}점</strong>{' '}
                  <Link to="/official" className="underline">
                    공식전 하러 가기
                  </Link>
                </p>
              )}
              <AttendanceCalendar month={month} days={mine.days} today={today} doubleDays={doubleDays} />
              <div className="flex flex-col gap-1 text-sm">
                <p>
                  이번 달 연습 점수 <strong>{mine.practice.xp.toLocaleString('ko-KR')}</strong> · 경기 {mine.practice.games}판
                </p>
                <p className="flex flex-wrap gap-2" aria-label="이번 달 연습 목표">
                  {MONTH_XP_GOALS.map((goal) => (
                    <span key={goal} className="rounded-full border px-2 text-xs" style={{ borderColor: 'var(--line)', ...(goals.reached.includes(goal) ? { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' } : {}) }}>
                      {goals.reached.includes(goal) ? '달성 ' : ''}
                      {goal.toLocaleString('ko-KR')}점
                    </span>
                  ))}
                  <span className="rounded-full border px-2 text-xs" style={{ borderColor: 'var(--line)', ...(goals.gamesReached ? { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' } : {}) }}>
                    {goals.gamesReached ? '달성 ' : ''}
                    {MONTH_GAMES_GOAL}판
                  </span>
                </p>
                <p className="text-xs text-ink-2 break-keep">연습 점수는 기기에서 채점하는 비공식 기록이라 등수에 넣지 않아요. 나만의 이번 달 목표예요.</p>
              </div>
            </section>
          ) : (
            !member && (
              <p className="sticker flex flex-col gap-2 p-4 text-sm break-keep">
                등수에는 회원만 올라요. 가입하면 출석 도장을 찍을 수 있어요.
                <Link to="/auth?mode=signup&returnTo=%2Franking" className="flex min-h-11 items-center font-semibold underline">
                  가입하기
                </Link>
              </p>
            )
          )}

          {board && (
            <section aria-labelledby="ranking-teams" className="flex flex-col gap-2">
              <h2 id="ranking-teams" className="font-cute text-xl">
                구단 대항전
              </h2>
              <p className="text-sm text-ink-2 break-keep">
                최애 구단(1위)이 같은 팬들의 이번 달 출석 일수 합이에요. 출석한 팬이 {TEAM_MIN_FANS}명 이상인 구단만 보여요.
              </p>
              {board.teams.length === 0 ? (
                <p className="text-sm">아직 {TEAM_MIN_FANS}명 이상 출석한 구단이 없어요. 같은 팬을 불러 모아 보세요!</p>
              ) : (
                <ol aria-label="구단 대항전 순위" className="flex flex-col gap-1">
                  {board.teams.map((item, index) => (
                    <li
                      key={item.team}
                      aria-current={item.team === myTeam ? 'true' : undefined}
                      className="flex items-center gap-3 rounded-option border px-3 py-2 text-sm"
                      style={{ borderColor: item.team === myTeam ? 'var(--accent)' : 'var(--line)', borderWidth: item.team === myTeam ? 2 : 1 }}
                    >
                      <span className="font-cute w-10 shrink-0 text-lg">{index + 1}위</span>
                      <span className="flex-1 font-semibold">
                        {teamName(item.team)}
                        {item.team === myTeam && <span className="ml-2 text-xs text-ink-2">우리 구단</span>}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold">출석 {item.days}일</span>
                        <span className="block text-xs text-ink-2">팬 {item.fans}명</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

          {lastBoard && (
            <section aria-labelledby="ranking-last" className="flex flex-col gap-3">
              <h2 id="ranking-last" className="font-cute text-xl">
                {monthLabel(last)} 명예의 전당
              </h2>
              {mine?.award && (
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  내 칭호: {mine.award.rank}위 <Titles titles={mine.award.titles} />
                </p>
              )}
              <Standings entries={lastBoard.top.slice(0, 10)} label={`${monthLabel(last)} 상위 10명`} />
            </section>
          )}

          <section aria-labelledby="ranking-rules" className="flex flex-col gap-1 text-sm text-ink-2 break-keep">
            <h2 id="ranking-rules" className="font-semibold text-ink-1">
              포인트와 칭호
            </h2>
            <p>
              포인트 = 출석 + 오늘의 공식전. 출석 하루 {POINTS.day}점, 그 달 안에서 {STREAK_WEEK}일 연속마다 +{POINTS.week}점, 개근 +{POINTS.perfect}점. 공식전은 하루 {OFFICIAL_TOTAL}문제를 새벽에 채점한 점수예요. 같은 포인트는 같은 순위예요.
            </p>
            {doubleDays.length > 0 && (
              <p className="font-semibold text-ink-1">
                이번 달 출석 {DOUBLE_FACTOR}배 날: {doubleDays.map((day) => `${Number(month.slice(4, 6))}월 ${day}일`).join(', ')}
              </p>
            )}
            <p>
              매달 1일 새벽에 지난달 등수를 확정해요. 1위 {TITLE_LABEL.king}, 2~3위 {TITLE_LABEL.allstar}, 4~10위 {TITLE_LABEL.hall}, 개근하면 {TITLE_LABEL.perfect}.
            </p>
            <p>
              등수에는 닉네임과 최애 구단만 보여요. 설정에서 닉네임을 숨길 수 있어요(&quot;{HIDDEN_NAME}&quot;로 표시).
            </p>
          </section>
        </>
      )}
    </main>
  );
}
