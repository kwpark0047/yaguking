import type { AtBatResult, BoxScore, Difficulty, UpgradeReason } from '@/lib/engine';

/**
 * 와이어 계약(DTO).
 *
 * 클라이언트 컴포넌트가 `@/server/*`를 import하지 않도록 응답 타입을 여기에
 * 모은다. 서버 함수들은 이 타입을 반환 타입으로 선언하므로 계약이 한 곳에서
 * 강제된다.
 *
 * **진행 중 타석에 정답·해설이 들어갈 자리가 아예 없다**는 것이 이 파일의 핵심이다.
 */

export type ApiEnvelope<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { code: string; message: string; requestId: string; detail?: unknown };
    };

export interface OptionDto {
  id: string;
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
}

/** 진행 중 타석. 정답·해설 필드가 존재하지 않는다. */
export interface AtBatDto {
  sequence: number;
  questionId: string;
  category: string;
  difficulty: Difficulty;
  seasonScope: string | null;
  /** 기록 기준일. 화면에 반드시 표기한다 (01 문서 §5). */
  recordAsOf: string;
  stem: string;
  options: OptionDto[];
  openedAt: string;
  deadlineAt: string;
  /** 서버가 계산한 남은 시간. 클라이언트 시계 오차를 피하려면 이 값을 기준으로 삼는다. */
  remainingMs: number;
}

export interface ScoreboardDto {
  inning: number;
  outs: number;
  /** 비트마스크: 1 = 1루, 2 = 2루, 4 = 3루 */
  bases: number;
  runs: number;
  streak: number;
}

export interface GoalDto {
  kind: 'innings' | 'pa';
  target: number;
}

export interface StartSessionDto {
  sessionId: string;
  mode: string;
  official: boolean;
  goal: GoalDto;
  scoreboard: ScoreboardDto;
  atBat: AtBatDto;
  guestTrialRemaining: number | null;
}

export interface PlayStateDto {
  sessionId: string;
  mode: string;
  official: boolean;
  status: string;
  scoreboard: ScoreboardDto;
  atBat: AtBatDto | null;
  atBatsPlayed: number;
}

/** 타석 종료 후에만 내려오는 공개 정보 */
export interface RevealDto {
  explanation: string | null;
  correctOption: { id: string; label: string; text: string };
  sources: { name: string; url: string | null; verifiedAt: string }[];
}

export interface FinishDto {
  boxScore: BoxScore;
  recorded: boolean;
  xpEarned: number;
  totalXp: number | null;
  level: number | null;
}

export interface SubmitAtBatDto {
  outcome: 'resolved' | 'replayed' | 'deadline_exceeded';
  result: AtBatResult;
  upgraded: boolean;
  upgradeReason: UpgradeReason | null;
  isCorrect: boolean;
  elapsedMs: number;
  rbi: number;
  /** 이 타석으로 이닝이 끝났는지. 교대 연출에 쓴다. */
  inningEnded: boolean;
  reveal: RevealDto | null;
  scoreboard: ScoreboardDto;
  next: AtBatDto | null;
  finished: boolean;
  finish: FinishDto | null;
}

export interface CareerBattingDto {
  pa: number;
  ab: number;
  h: number;
  hr: number;
  bb: number;
  so: number;
  r: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
}

export interface ClaimGuestDto {
  /** 이미 승계된 토큰이면 true. 오류가 아니라 멱등 응답이다. */
  alreadyClaimed: boolean;
  claimedSessions: number;
  /** 이번 승계로 통산에 더해진 기록 */
  migrated: BoxScore;
  career: CareerBattingDto | null;
}

export type RankingKind = 'rate' | 'volume';

export interface RankingEntryDto {
  rank: number;
  nickname: string;
  level: number;
  /** 대표 구단. 행마다 그 선수의 구단색을 입힌다. 미설정이면 null */
  teamSlug: string | null;
  teamShortName: string | null;
  /** 주 지표 표기 (`.327` 또는 `12득점`) */
  primary: string;
  secondary: string;
}

export interface RankingDto {
  kind: RankingKind;
  /** 산출 기준을 화면에 그대로 적는다 (08 문서 V15) */
  criterion: string;
  minimumPa: number | null;
  computedAt: string;
  entries: RankingEntryDto[];
}

export interface RecentGameDto {
  sessionId: string;
  mode: string;
  runs: number;
  endedAt: string | null;
}

export interface DashboardDto {
  nickname: string;
  level: number;
  levelName: string;
  totalXp: number;
  primaryTeamName: string | null;
  onboardingComplete: boolean;
  career: CareerBattingDto | null;
  recentGames: RecentGameDto[];
}

/** 공유 카드용 공개 요약. 문항·정답·개인정보는 담지 않는다. */
export interface ShareCardDto {
  nickname: string;
  levelName: string;
  /** 등급 장식에 쓴다. 비회원이면 1 */
  level: number;
  /** **기록을 만든 사람의** 대표 구단. 보는 사람과 무관하다. */
  teamSlug: string | null;
  teamShortName: string | null;
  runs: number;
  pa: number;
  avg: string;
  ops: string;
}

/** 업적 카드 한 장 (14 문서 §5.2). 획득 여부는 타석 원장에서 매번 계산한다. */
export interface AchievementDto {
  id: string;
  title: string;
  condition: string;
  /** 1~7. 같은 숫자의 등급 프레임을 쓴다 */
  rarity: number;
  earned: boolean;
  /** 처음 획득한 날(KST, YYYY-MM-DD). 원장에 시각이 없는 업적이면 null */
  earnedOn: string | null;
}

/** 내 데이터 내보내기 (08 문서 V17). 다른 회원의 정보는 담기지 않는다. */
export interface AccountExportDto {
  exportedAt: string;
  profile: {
    nickname: string;
    primaryTeamName: string | null;
    onboardingStatus: string;
    joinedAt: string;
  };
  battingStats: {
    scope: 'career' | 'season';
    pa: number;
    ab: number;
    h: number;
    hr: number;
    bb: number;
    so: number;
    r: number;
  }[];
  xpLedger: { amount: number; reason: string; at: string }[];
  sessions: {
    id: string;
    mode: string;
    runs: number;
    official: boolean;
    status: string;
    startedAt: string;
    endedAt: string | null;
  }[];
  atBats: {
    sessionId: string;
    sequence: number;
    result: string | null;
    elapsedMs: number | null;
    isCorrect: boolean | null;
    submittedAt: string | null;
  }[];
  zoneCells: {
    era_band: number;
    difficulty_band: number;
    attempts: number;
    correct: number;
  }[];
}

export interface AdminQuestionDto {
  id: string;
  stem: string;
  categorySlug: string;
  difficulty: Difficulty;
  status: string;
  recordAsOf: string;
  optionCount: number;
  correctCount: number;
  sourceCount: number;
  publishable: boolean;
}

export interface AtBatLogEntryDto {
  sequence: number;
  inning: number;
  result: AtBatResult;
  elapsedMs: number | null;
  isCorrect: boolean | null;
  category: string;
  difficulty: string;
  /** 결과 화면에서만 채운다. 진행 중 화면은 쓰지 않는다. */
  stem?: string;
  /** 타석이 끝난 뒤에만 채운다 (해설·출처 펼침용) */
  reveal?: RevealDto | null;
}
