import type { AtBatResult, Difficulty, UpgradeReason } from '@/lib/engine';

/**
 * 화면 문구.
 *
 * 결과는 **배지 텍스트가 1차 정보이고 색은 보조**다. 색만으로 의미를 전달하지
 * 않도록 아이콘과 텍스트를 함께 쓴다 (08 문서 §4.3).
 */

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '초급',
  normal: '중급',
  hard: '고급',
};

export interface ResultPresentation {
  /** 배지에 쓰는 말 */
  label: string;
  /** 색과 무관하게 의미를 전달하는 기호 */
  icon: string;
  /** 토큰 이름 (출루 / 아웃 / 홈런) */
  tone: 'on-base' | 'out' | 'hr';
  /** 출루했는지 — 다이아몬드 연출 분기 */
  onBase: boolean;
}

export const RESULT_PRESENTATION: Record<AtBatResult, ResultPresentation> = {
  HR: { label: '홈런!', icon: '⚾', tone: 'hr', onBase: true },
  '3B': { label: '3루타', icon: '→', tone: 'on-base', onBase: true },
  '2B': { label: '2루타', icon: '→', tone: 'on-base', onBase: true },
  '1B': { label: '안타', icon: '→', tone: 'on-base', onBase: true },
  BB: { label: '볼넷', icon: '◦', tone: 'on-base', onBase: true },
  K: { label: '삼진 · 아웃', icon: '✕', tone: 'out', onBase: false },
};

/** 시간초과는 같은 K이지만 다르게 읽어 준다. */
export function resultLabel(result: AtBatResult, timedOut: boolean): string {
  if (result === 'K' && timedOut) return '루킹 삼진 · 아웃';
  return RESULT_PRESENTATION[result].label;
}

/**
 * 승급 사유를 한 줄로 밝힌다.
 * 왜 2루타가 3루타가 되었는지 모르면 "고급 문항이 유리하다"는 학습이 생기지 않는다.
 */
export const UPGRADE_LABEL: Record<UpgradeReason, string> = {
  hard: '고급 문항 보너스 · 한 단계 상승',
  streak: '5연속 정답 보너스 · 한 단계 상승',
  both: '고급 문항 + 연속 정답 보너스 · 한 단계 상승',
};

export const MODE_LABEL: Record<string, string> = {
  trial: '체험 1이닝',
  official_3: '공식 3이닝',
  full_9: '풀게임 9이닝',
  daily: '오늘의 야구',
  zone_training: '약점 코스 훈련',
  ghost: '고스트 대결',
};

/**
 * 레벨 표기 (06 문서 §9).
 *
 * XP 임계값은 V1과 동일하게 두고 **표기만** 야구 등급명으로 바꿨다.
 * 임계값의 단일 출처는 DB 함수 `public.level_for_xp`다.
 */
export const LEVEL_NAME: Record<number, string> = {
  1: '육성선수',
  2: '백업',
  3: '주전',
  4: '올스타',
  5: '골든글러브',
  6: 'MVP',
  7: '명예의 전당',
};

/** 레벨별 누적 XP 하한. 표시용이며 판정은 DB가 한다. */
export const LEVEL_THRESHOLDS = [0, 500, 1500, 3500, 7000, 12000, 20000] as const;

export function levelName(level: number): string {
  return LEVEL_NAME[level] ?? LEVEL_NAME[1]!;
}

/** 다음 레벨까지의 진행률(0~1). 최고 레벨이면 1. */
export function levelProgress(level: number, totalXp: number): number {
  if (level >= 7) return 1;
  const current = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level] ?? current;
  if (next <= current) return 1;
  const ratio = (totalXp - current) / (next - current);
  return Math.max(0, Math.min(1, ratio));
}

/** 누적 XP → 레벨(1~7) — 임계값 표(LEVEL_THRESHOLDS)의 하한을 넘은 가장 높은 레벨 */
export function levelForXp(totalXp: number): number {
  let level = 1;
  LEVEL_THRESHOLDS.forEach((threshold, index) => {
    if (totalXp >= threshold) level = index + 1;
  });
  return level;
}

export interface LevelChange {
  before: number;
  after: number;
  xpBefore: number;
  xpAfter: number;
}

/** 이번 경기 XP를 더하기 전·후의 레벨(비공식) */
export function levelChange(xpAfter: number, gained: number): LevelChange {
  const xpBefore = Math.max(0, xpAfter - gained);
  return { before: levelForXp(xpBefore), after: levelForXp(xpAfter), xpBefore, xpAfter };
}

/** 밀리초를 "3.4초"로 */
export function formatElapsed(ms: number | null): string {
  if (ms === null) return '-';
  return `${(ms / 1000).toFixed(1)}초`;
}
