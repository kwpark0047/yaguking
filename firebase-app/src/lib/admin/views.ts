/**
 * 관리자 화면 "한 번 읽기" 보기(docs/admin-dashboard-plan.md).
 *
 * 화면을 열 때는 미리 만든 문서 `adminViews/{화면}` **하나만** 읽는다(읽기 1). 문서는 관리자의 "새로 만들기"가
 * 여러 문서를 읽어 다시 만든다(그때만 읽기 여러 번 + 쓰기 1). 여기는 그 계산만 — Firestore와 무관한 순수 함수.
 * 시각은 모두 ms, 날짜 경계는 한국 시간.
 */
export const VIEW_IDS = ['dashboard', 'members', 'games', 'rooms', 'notices', 'logs'] as const;
export type ViewId = (typeof VIEW_IDS)[number];

const DAY = 86_400_000;
const HOUR = 3_600_000;
const KST = 9 * HOUR;

export const kstDayStart = (now: number) => Math.floor((now + KST) / DAY) * DAY - KST;
export const kstHour = (ms: number) => new Date(ms + KST).getUTCHours();

// ── 회원 ─────────────────────────────────────────────────────────────────────
export interface MemberViewRow {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  providers: string[];
  createdAt: number;
  lastSignInAt: number;
  disabled: boolean;
  admin: boolean;
  /** 프로필(users/{uid}) — 만 14세 확인 전이면 없음 */
  ageConfirmedAt: number | null;
  nickname: string | null;
  favoriteTeams: string[];
  levelTest: { tier: number; correct: number; total: number; at: number } | null;
  /** 누적(비공식) */
  games: number;
  hits: number;
  atBats: number;
  homeRuns: number;
  lastGameAt: number | null;
}

export type MemberStatus = 'needs-age' | 'needs-profile' | 'needs-level-test' | 'active' | 'dormant' | 'idle';

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  'needs-age': '14세 미확인',
  'needs-profile': '프로필 미완료',
  'needs-level-test': '레벨 테스트 안 함',
  active: '활동 중',
  dormant: '오래 안 옴',
  idle: '보통',
};

/** 한 사람에게 하나 — 앞쪽이 우선(가입이 덜 끝난 것부터) */
export function memberStatus(row: MemberViewRow, now: number): MemberStatus {
  if (row.ageConfirmedAt === null) return 'needs-age';
  if (!row.nickname || row.favoriteTeams.length === 0) return 'needs-profile';
  if (!row.levelTest) return 'needs-level-test';
  if (row.lastSignInAt >= now - 7 * DAY) return 'active';
  if (row.lastSignInAt < now - 90 * DAY) return 'dormant';
  return 'idle';
}

export const emailUnverified = (row: Pick<MemberViewRow, 'providers' | 'emailVerified'>) =>
  row.providers.includes('password') && !row.emailVerified;

export interface Funnel {
  signedUp: number;
  ageConfirmed: number;
  profile: number;
  levelTest: number;
  firstGame: number;
}

/** 가입 단계 깔때기 — 가입 → 14세 확인 → 프로필 → 레벨 테스트 → 첫 경기 */
export function funnelOf(rows: readonly MemberViewRow[]): Funnel {
  return {
    signedUp: rows.length,
    ageConfirmed: rows.filter((row) => row.ageConfirmedAt !== null).length,
    profile: rows.filter((row) => row.ageConfirmedAt !== null && row.nickname && row.favoriteTeams.length > 0).length,
    levelTest: rows.filter((row) => row.levelTest !== null).length,
    firstGame: rows.filter((row) => row.games > 0).length,
  };
}

/** 가입하고 이만큼 지나도 14세 확인을 안 했으면 "살펴볼 것" */
export const STUCK_SIGNUP_MS = 3 * DAY;

export function membersSummary(rows: readonly MemberViewRow[], now: number) {
  const today = kstDayStart(now);
  return {
    members: rows.filter((row) => row.ageConfirmedAt !== null).length,
    accounts: rows.length,
    signupsToday: rows.filter((row) => row.createdAt >= today).length,
    stuckSignups: rows.filter((row) => row.ageConfirmedAt === null && row.createdAt < now - STUCK_SIGNUP_MS).length,
    funnel: funnelOf(rows),
  };
}

// ── 경기 ─────────────────────────────────────────────────────────────────────
export interface GameAtBat {
  questionId: string;
  choice: string | null;
  correct: boolean;
  elapsedMs: number;
  result: string;
  rbi: number;
}

export interface GameViewRow {
  id: string;
  uid: string;
  /** 회원이면 닉네임, 비회원이면 null */
  nickname: string | null;
  member: boolean;
  mode: string;
  createdAt: number;
  runs: number;
  pa: number;
  atBats: GameAtBat[];
}

export type GameFlag = 'too-fast' | 'same-choice' | 'too-many';

export const GAME_FLAG_LABEL: Record<GameFlag, string> = {
  'too-fast': '너무 빠름',
  'same-choice': '같은 답 반복',
  'too-many': '하루 경기 과다',
};

/** 이상 징후 기준(처음 값 — 실제 분포를 보고 조정, 계획 §3-4). 표시만 하고 기록은 고치지 않는다 */
export const FLAG_RULES = {
  fastAverageMs: 600,
  fastCorrectRate: 0.9,
  minAtBats: 3,
  manyGamesPerDay: 40,
} as const;

export function gameFlags(game: Pick<GameViewRow, 'atBats'>, gamesByThisPlayerToday: number): GameFlag[] {
  const flags: GameFlag[] = [];
  const answered = game.atBats.filter((atBat) => atBat.choice !== null);
  if (game.atBats.length >= FLAG_RULES.minAtBats && answered.length > 0) {
    const average = answered.reduce((sum, atBat) => sum + atBat.elapsedMs, 0) / answered.length;
    const rate = game.atBats.filter((atBat) => atBat.correct).length / game.atBats.length;
    if (average < FLAG_RULES.fastAverageMs && rate >= FLAG_RULES.fastCorrectRate) flags.push('too-fast');
    if (answered.length === game.atBats.length && new Set(answered.map((atBat) => atBat.choice)).size === 1) flags.push('same-choice');
  }
  if (gamesByThisPlayerToday > FLAG_RULES.manyGamesPerDay) flags.push('too-many');
  return flags;
}

export function gamesSummary(games: readonly GameViewRow[]) {
  const atBats = games.flatMap((game) => game.atBats);
  const perUid = new Map<string, number>();
  for (const game of games) perUid.set(game.uid, (perUid.get(game.uid) ?? 0) + 1);
  const hourly = Array.from({ length: 24 }, () => 0);
  for (const game of games) hourly[kstHour(game.createdAt)]! += 1;
  const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
  return {
    games: games.length,
    practice: games.filter((game) => game.mode === 'practice').length,
    levelTests: games.filter((game) => game.mode === 'levelTest').length,
    memberGames: games.filter((game) => game.member).length,
    guestGames: games.filter((game) => !game.member).length,
    players: perUid.size,
    averageRuns: games.length ? round(games.reduce((sum, game) => sum + game.runs, 0) / games.length) : 0,
    averagePa: games.length ? round(games.reduce((sum, game) => sum + game.pa, 0) / games.length) : 0,
    correctRate: atBats.length ? round(atBats.filter((atBat) => atBat.correct).length / atBats.length, 3) : 0,
    homeRunRate: atBats.length ? round(atBats.filter((atBat) => atBat.result === 'HR').length / atBats.length, 3) : 0,
    hourly,
    flagged: games.filter((game) => gameFlags(game, perUid.get(game.uid) ?? 0).length > 0).length,
  };
}

/** 오늘 경기 중 정답률이 낮은 문항(3번 이상 나온 것) */
export function hardestQuestions(games: readonly GameViewRow[], top = 10) {
  const stats = new Map<string, { shown: number; correct: number }>();
  for (const atBat of games.flatMap((game) => game.atBats)) {
    const item = stats.get(atBat.questionId) ?? { shown: 0, correct: 0 };
    item.shown += 1;
    if (atBat.correct) item.correct += 1;
    stats.set(atBat.questionId, item);
  }
  return [...stats.entries()]
    .filter(([, item]) => item.shown >= 3)
    .map(([questionId, item]) => ({ questionId, shown: item.shown, rate: item.correct / item.shown }))
    .sort((a, b) => a.rate - b.rate || b.shown - a.shown)
    .slice(0, top);
}

// ── 대결 방 ──────────────────────────────────────────────────────────────────
export interface RoomSeatRow {
  uid: string;
  nickname: string;
  score: number;
  answered: number;
  correct: number;
  lastAnswerAt: number | null;
}

export interface RoomViewRow {
  code: string;
  status: 'waiting' | 'playing' | 'finished';
  hostUid: string;
  createdAt: number;
  startedAt: number | null;
  maxPlayers: number;
  players: number;
  questions: number;
  seats: RoomSeatRow[];
}

export type RoomFlag = 'stalled' | 'waiting-long' | 'expired';

export const ROOM_FLAG_LABEL: Record<RoomFlag, string> = {
  stalled: '진행 멈춤',
  'waiting-long': '시작 안 함',
  expired: '정리 대상',
};

/** 정리 작업과 같은 기준(ops/cleanup.mjs ROOM_RETENTION_HOURS) */
export const ROOM_EXPIRE_MS = 24 * HOUR;
export const ROOM_STALL_MS = 10 * 60_000;
export const ROOM_WAIT_MS = HOUR;

export function roomFlags(room: RoomViewRow, now: number): RoomFlag[] {
  if (room.createdAt < now - ROOM_EXPIRE_MS) return ['expired'];
  const flags: RoomFlag[] = [];
  if (room.status === 'waiting' && room.createdAt < now - ROOM_WAIT_MS) flags.push('waiting-long');
  if (room.status === 'playing') {
    const last = Math.max(room.startedAt ?? 0, ...room.seats.map((seat) => seat.lastAnswerAt ?? 0));
    const done = room.seats.every((seat) => seat.answered >= room.questions);
    if (!done && last < now - ROOM_STALL_MS) flags.push('stalled');
  }
  return flags;
}

export function roomProgress(room: RoomViewRow): number {
  const total = room.players * room.questions;
  if (total === 0) return 0;
  return Math.min(1, room.seats.reduce((sum, seat) => sum + seat.answered, 0) / total);
}

export function roomsSummary(rooms: readonly RoomViewRow[], now: number) {
  return {
    rooms: rooms.length,
    waiting: rooms.filter((room) => room.status === 'waiting').length,
    playing: rooms.filter((room) => room.status === 'playing').length,
    finished: rooms.filter((room) => room.status === 'finished').length,
    stalled: rooms.filter((room) => roomFlags(room, now).includes('stalled')).length,
    expired: rooms.filter((room) => roomFlags(room, now).includes('expired')).length,
  };
}

/** 보기 문서가 이만큼 지났으면 화면이 "오래됨"을 알린다(자동으로 다시 만들지는 않는다 — 읽기 1 유지) */
export const VIEW_STALE_MS = 30 * 60_000;
