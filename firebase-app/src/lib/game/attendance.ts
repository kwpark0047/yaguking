/**
 * 매일 출석·월간 등수(docs/engagement-plan.md) — 순수 계산만(저장은 engagement.ts, 화면은 AttendanceCard·RankingPage).
 *
 * - 출석은 보안 규칙이 서버 시각으로 지킨다(하루 한 번, 어제·내일 불가) → 등수에 쓸 수 있다
 * - 등수는 운영자 PC 매일 작업(ops/monthly.mjs)이 계산한다. **포인트 계산은 그 파일과 같아야 한다**
 *   (tests/unit/attendance.test.ts가 둘을 대조한다)
 * - 연습 점수(기기 계산)는 등수에 넣지 않는다 — 내 기록·이번 달 목표 배지만
 */

/** 출석·등수 시작일(한국 날짜). 처리방침 개정(src/content/privacy.ts)이 이날 시행된다 — 그 전에는 화면을 열지 않는다 */
export const ENGAGEMENT_START = '2026-11-05';

export const POINTS = { day: 10, week: 30, perfect: 100 } as const;
/** 출석 2배 날(관리자가 정함)에는 그날 출석이 두 배 */
export const DOUBLE_FACTOR = 2;
/** 구단 대항전 — 참여 팬이 이만큼 이상인 구단만 보여 준다(한두 명이면 누구인지 짐작할 수 있어서) */
export const TEAM_MIN_FANS = 3;
export const STREAK_WEEK = 7;
export const RANKING_TOP = 50;
export const HIDDEN_NAME = '익명 선수';
/** 이번 달 연습 목표(비공식 — 기기 계산). 한 판 XP는 보통 50~100 */
export const MONTH_XP_GOALS = [500, 1500, 3000] as const;
export const MONTH_GAMES_GOAL = 30;

const KST = 9 * 3_600_000;
const kst = (nowMs: number) => new Date(nowMs + KST);

/** 한국 시각의 이번 달 "YYYYMM" — 규칙의 kstMonth()와 같다 */
export function kstMonthKey(nowMs: number = Date.now()): string {
  const date = kst(nowMs);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 한국 시각의 오늘 날짜(1~31) — 규칙의 kstDayOfMonth()와 같다 */
export function kstDayOfMonth(nowMs: number = Date.now()): number {
  return kst(nowMs).getUTCDate();
}

/** 한국 날짜 "YYYY-MM-DD" */
export function kstDate(nowMs: number = Date.now()): string {
  return kst(nowMs).toISOString().slice(0, 10);
}

export function daysInMonth(month: string): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4, 6)), 0)).getUTCDate();
}

export function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(4, 6)) - 1; // 0~11
  return index === 0 ? `${year - 1}12` : `${year}${String(index).padStart(2, '0')}`;
}

/** "2026년 11월" */
export const monthLabel = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(4, 6))}월`;

/** 화면을 여는 시작일. 에뮬레이터 개발·E2E에서만 VITE_ENGAGEMENT_START로 앞당길 수 있다(실제 빌드는 항상 ENGAGEMENT_START) */
export function engagementStart(): string {
  // 이 파일은 운영자 PC 작업·테스트(Node)에서도 불러온다 — 거기에는 import.meta.env가 없다
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  const override = env?.VITE_ENGAGEMENT_START;
  return env?.VITE_USE_EMULATORS !== 'false' && override ? override : ENGAGEMENT_START;
}

export const engagementOpen = (today: string, start: string = engagementStart()) => today >= start;

/** 그 달에서 포인트를 세는 첫날 — 시작한 달은 시작일부터 */
export function firstCountedDay(month: string, start: string = ENGAGEMENT_START): number {
  const startMonth = start.slice(0, 4) + start.slice(5, 7);
  if (month < startMonth) return Number.POSITIVE_INFINITY;
  return month === startMonth ? Number(start.slice(8, 10)) : 1;
}

export interface AttendancePoints {
  points: number;
  days: number;
  weeks: number;
  perfect: boolean;
}

/**
 * 출석 포인트 — 하루 10(출석 2배 날은 20), 그 달 안에서 7일 연속을 채울 때마다 +30, 개근(세는 첫날부터 그 달 끝까지 모두) +100.
 * `through`일까지만 센다(등수는 "어제까지" 기준). 개근은 그 달을 다 셌을 때만.
 */
export function attendancePoints(
  days: readonly number[],
  month: string,
  through: number = daysInMonth(month),
  start: string = ENGAGEMENT_START,
  doubleDays: readonly number[] = [],
): AttendancePoints {
  const first = firstCountedDay(month, start);
  const last = Math.min(through, daysInMonth(month));
  const counted = [...new Set(days)].filter((day) => Number.isInteger(day) && day >= first && day <= last).sort((a, b) => a - b);
  let weeks = 0;
  let run = 0;
  counted.forEach((day, index) => {
    run = index > 0 && counted[index - 1] === day - 1 ? run + 1 : 1;
    if (run % STREAK_WEEK === 0) weeks += 1;
  });
  const monthDone = last === daysInMonth(month);
  const perfect = monthDone && counted.length > 0 && counted.length === last - first + 1;
  const doubled = counted.filter((day) => doubleDays.includes(day)).length;
  return {
    points: (counted.length + doubled * (DOUBLE_FACTOR - 1)) * POINTS.day + weeks * POINTS.week + (perfect ? POINTS.perfect : 0),
    days: counted.length,
    weeks,
    perfect,
  };
}

/**
 * 연속 출석 일수(화면 표시용 — 포인트와 무관, 달을 넘어 이어진다). 오늘 아직 안 찍었으면 어제까지의 연속.
 * 이번 달이 1일부터 이어져 있을 때만 지난달 목록이 필요하다(`needsPrevious`).
 */
export function streakOf(thisMonth: readonly number[], today: number, previous: readonly number[] | null, previousLength: number): number {
  const set = new Set(thisMonth);
  let day = set.has(today) ? today : today - 1;
  let streak = 0;
  while (day >= 1 && set.has(day)) {
    streak += 1;
    day -= 1;
  }
  if (day === 0 && previous) {
    const before = new Set(previous);
    for (let d = previousLength; d >= 1 && before.has(d); d -= 1) streak += 1;
  }
  return streak;
}

export function needsPrevious(thisMonth: readonly number[], today: number): boolean {
  const set = new Set(thisMonth);
  for (let day = set.has(today) ? today : today - 1; day >= 1; day -= 1) if (!set.has(day)) return false;
  return true;
}

/** 연속 출석 띠를 띄우는 날 */
export const STREAK_MILESTONES = [3, 7, 14, 30] as const;

export type Title = 'king' | 'allstar' | 'hall' | 'perfect';
export const TITLE_LABEL: Record<Title, string> = {
  king: '이달의 야구왕',
  allstar: '이달의 올스타',
  hall: '명예의 전당',
  perfect: '개근상',
};

/** 확정된 달의 칭호 — 1위 야구왕, 2~3위 올스타, 4~10위 명예의 전당, 개근은 따로 */
export function titlesFor(rank: number, perfect: boolean): Title[] {
  const titles: Title[] = [];
  if (rank === 1) titles.push('king');
  else if (rank <= 3) titles.push('allstar');
  else if (rank <= 10) titles.push('hall');
  if (perfect) titles.push('perfect');
  return titles;
}

/** 구단 대항전 한 줄 — 최애 구단 1위가 같은 팬들의 합(참여 TEAM_MIN_FANS명 이상인 구단만) */
export interface TeamStanding {
  team: string;
  fans: number;
  days: number;
  points: number;
}

/** 등수 문서(leaderboards/{YYYYMM}) — ops/monthly.mjs가 쓴다 */
export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  team: string | null;
  points: number;
  days: number;
  /** 오늘의 공식전 점수 합·횟수(2차) */
  official: number;
  rounds: number;
  /** 지난달 칭호(이번 달 등수) 또는 이 달 칭호(확정된 달) */
  titles: Title[];
}

export interface Leaderboard {
  month: string;
  top: LeaderboardEntry[];
  participants: number;
  /** 포인트 → 사람 수. 내 순위를 따로 읽지 않고 계산한다 */
  histogram: Record<string, number>;
  /** 이날까지 셌다(1~31) */
  through: number;
  /** 그 달의 출석 2배 날(1~31) */
  doubleDays: number[];
  /** 구단 대항전 — 출석 일수 합 순 */
  teams: TeamStanding[];
  final: boolean;
  updatedAt: number;
}

/** 내 순위 = 1 + 나보다 포인트가 높은 사람 수(같으면 같은 순위). 0점이면 순위 없음 */
export function rankFromHistogram(points: number, histogram: Record<string, number>): { rank: number | null; participants: number } {
  let above = 0;
  let participants = 0;
  for (const [key, count] of Object.entries(histogram)) {
    participants += count;
    if (Number(key) > points) above += count;
  }
  return { rank: points > 0 ? above + 1 : null, participants };
}

/** 이번 달 연습 목표 — 다음 목표와 달성한 것 */
export function monthGoals(xp: number, games: number) {
  const reached = MONTH_XP_GOALS.filter((goal) => xp >= goal);
  const next = MONTH_XP_GOALS.find((goal) => xp < goal) ?? null;
  return { reached, next, gamesReached: games >= MONTH_GAMES_GOAL };
}
