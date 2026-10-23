/**
 * 판정 엔진 타입.
 *
 * 이 디렉터리는 순수 함수만 포함한다. IO·DB·프레임워크 의존 금지(eslint로 강제).
 * 판정 규칙의 단일 진실 공급원이며 SQL로 복제하지 않는다 (09 문서 §3.1).
 */

/** 타석 결과. 3루타는 승급 경로로만 발생한다 (06 문서 §4.2). */
export type AtBatResult = 'K' | 'BB' | '1B' | '2B' | '3B' | 'HR';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** 승급 사유 — 화면에 한 줄로 밝힌다 (08 문서 §4.3). */
export type UpgradeReason = 'hard' | 'streak' | 'both';

export interface AtBatVerdict {
  result: AtBatResult;
  upgraded: boolean;
  upgradeReason: UpgradeReason | null;
  streakAfter: number;
}

/** bases 비트마스크: 1 = 1루, 2 = 2루, 4 = 3루 (0~7) */
export interface RunnerAdvance {
  bases: number;
  runs: number;
}

/** 이닝제(체험·공식·풀게임)와 고정 타석제(약점 코스 훈련)를 구분한다. */
export type SessionGoal =
  | { kind: 'innings'; innings: number }
  | { kind: 'pa'; pa: number };

export interface SessionState {
  inning: number;
  outs: number;
  bases: number;
  /** 누적 득점 */
  runs: number;
  /** 직전 타석의 타점 */
  rbi: number;
  /** 누적 타석 수 (볼넷 포함) */
  paPlayed: number;
  /** 직전 타석으로 이닝이 종료되었는지 */
  inningEnded: boolean;
  finished: boolean;
}

export interface AtBatEntry {
  result: AtBatResult;
  rbi: number;
}

export interface BoxScore {
  /** 타석 */
  pa: number;
  /** 타수 (볼넷 제외) */
  ab: number;
  /** 안타 */
  h: number;
  singles: number;
  d2: number;
  d3: number;
  hr: number;
  bb: number;
  /** 삼진 */
  so: number;
  /** 누진타수 */
  tb: number;
  /** 득점 */
  r: number;
  avg: number | null;
  obp: number | null;
  slg: number | null;
  ops: number | null;
}
