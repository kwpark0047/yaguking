import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { celebrate } from '@/lib/effects/celebrate';
import { currentMode } from '@/lib/effects/preference';
import { TEAMS } from '@/content/teams';
import {
  DOUBLE_FACTOR,
  POINTS,
  STREAK_MILESTONES,
  attendancePoints,
  engagementStart,
  daysInMonth,
  kstDayOfMonth,
  kstMonthKey,
  needsPrevious,
  previousMonth,
  rankFromHistogram,
  streakOf,
  type Leaderboard,
} from '@/lib/game/attendance';
import { loadAttendance, loadLeaderboard, loadOfficialMonth, stampToday } from '@/lib/game/engagement';
import { officialSum } from '@/lib/game/official';
import { playSound } from '@/lib/sound/sound';
import { AttendanceCalendar } from './AttendanceCalendar';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };

/**
 * 홈 "오늘 출석" 카드(회원 — docs/engagement-plan.md §2). 읽기: 이번 달 출석 1 + 등수 1(앱을 쓰는 동안 기억), 도장 쓰기 1.
 * 도장을 찍으면 "쾅"(기존 도장 효과·소리), 3·7·14·30일 연속이면 띠와 꽃가루.
 */
export default function AttendanceCard({ uid, team }: { uid: string; team: string | null }) {
  const [now] = useState(() => Date.now());
  const month = kstMonthKey(now);
  const today = kstDayOfMonth(now);
  const [days, setDays] = useState<number[] | null>(null);
  const [previous, setPrevious] = useState<number[] | null>(null);
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [official, setOfficial] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [stamped, setStamped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [current, leaderboard] = await Promise.all([loadAttendance(uid, month), loadLeaderboard(month)]);
        // 공식전 점수는 등수가 있을 때만(내 순위 계산) 읽는다
        const scores = leaderboard && leaderboard.participants > 0 ? await loadOfficialMonth(uid, month) : {};
        // 1일부터 이어져 있을 때만 지난달을 읽는다(달을 넘는 연속)
        const before = needsPrevious(current, today) ? await loadAttendance(uid, previousMonth(month)) : null;
        if (cancelled) return;
        setDays(current);
        setPrevious(before);
        setBoard(leaderboard);
        setOfficial(scores);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, month, today]);

  async function stamp() {
    setPending(true);
    setFailed(false);
    try {
      const next = await stampToday(uid, now);
      setDays(next);
      setStamped(true);
      playSound('hit');
      const streak = streakOf(next, today, previous, daysInMonth(previousMonth(month)));
      if ((STREAK_MILESTONES as readonly number[]).includes(streak)) {
        celebrate({ kind: 'levelUp' });
        playSound('levelUp');
      }
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  const done = days?.includes(today) ?? false;
  const streak = days ? streakOf(days, today, previous, daysInMonth(previousMonth(month))) : 0;
  const milestone = stamped && (STREAK_MILESTONES as readonly number[]).includes(streak);
  const mine =
    days && board
      ? rankFromHistogram(
          attendancePoints(days, month, board.through, engagementStart(), board.doubleDays).points + officialSum(official, month, board.through).points,
          board.histogram,
        )
      : null;
  const double = board?.doubleDays.includes(today) ?? false;
  const teamName = (slug: string) => TEAMS.find((item) => item.slug === slug)?.shortName ?? slug;
  const teamRank = team && board ? board.teams.findIndex((item) => item.team === team) + 1 : 0;

  return (
    <section aria-labelledby="attendance-title" className="sticker flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="attendance-title" className="font-cute text-xl">
          오늘 출석
          {double && (
            <span className="ml-2 rounded-full px-2 align-middle font-sans text-sm font-semibold" style={primary}>
              오늘은 출석 2배!
            </span>
          )}
        </h2>
        {days && (
          <p className="text-sm text-ink-2">
            연속 {streak}일 · 이번 달 {days.length}일
          </p>
        )}
      </div>

      {failed && (
        <p role="alert" className="text-sm break-keep" style={{ color: 'var(--out)' }}>
          출석을 불러오거나 찍지 못했어요. 연결과 기기 시각을 확인하고 다시 시도해 주세요.
        </p>
      )}
      {days === null && !failed && <p className="text-sm text-ink-2">불러오는 중…</p>}

      {days && !done && (
        <button type="button" disabled={pending} onClick={() => void stamp()} className="squishy font-cute min-h-14 text-xl disabled:opacity-60" style={primary}>
          출석 도장 찍기 <span className="text-sm">+{POINTS.day * (double ? DOUBLE_FACTOR : 1)}점</span>
        </button>
      )}
      {days && done && (
        <p role="status" className="flex flex-wrap items-center gap-3 break-keep">
          <span className="fx-stamp font-cute" style={stamped && currentMode() !== 'none' ? undefined : { animation: 'none' }}>
            출석!
          </span>
          <span className="text-sm">
            {milestone ? `${streak}일 연속 출석!` : stamped ? `오늘 도장 완료 — 내일도 만나요` : '오늘은 이미 찍었어요'}
          </span>
        </p>
      )}

      {days && <AttendanceCalendar month={month} days={days} today={today} doubleDays={board?.doubleDays ?? []} />}

      {board && board.teams.length > 0 && (
        <p className="text-sm break-keep">
          구단 대항전: 1위 {teamName(board.teams[0]!.team)}
          {team && (teamRank > 0 ? ` · 우리 ${teamName(team)} ${teamRank}위` : ` · 우리 ${teamName(team)}는 팬 출석이 더 필요해요`)}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="break-keep">
          {mine?.rank
            ? `이번 달 ${mine.rank}위 / ${mine.participants}명 (어제까지)`
            : board && board.participants > 0
              ? `이번 달 참여 ${board.participants}명 — 오늘 찍은 도장은 내일 등수에 들어가요`
              : '등수는 매일 새벽에 어제까지의 출석·공식전으로 매겨요'}
        </p>
        <Link to="/ranking" className="flex min-h-11 items-center font-semibold underline">
          월간 등수 보기
        </Link>
      </div>
    </section>
  );
}
