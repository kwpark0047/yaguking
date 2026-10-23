import { z } from 'zod';
import type { SessionGoal } from '@/lib/engine';

export type PlayMode =
  | 'trial'
  | 'official_3'
  | 'full_9'
  | 'daily'
  | 'zone_training'
  | 'ghost';

/**
 * P1에서 지원하는 모드만 허용한다.
 * zone_training과 ghost는 P2다 (09 문서 §1.2 스코프 가드).
 */
export const startSessionSchema = z.object({
  mode: z.enum(['trial', 'official_3', 'full_9', 'daily']).default('trial'),
});

export const submitAtBatSchema = z.object({
  sequence: z.number().int().min(1).max(500),
  /**
   * 보기를 고르지 않은 제출은 **시간초과 확정 요청**이다.
   * 타이머가 0이 된 화면이 호출하며, 서버는 마감이 실제로 지났는지 확인한 뒤
   * 루킹 삼진으로 처리한다. 결과가 항상 아웃이므로 악용 동기가 없다.
   */
  optionId: z.uuid().optional(),
  /** 클라이언트 재시도를 같은 제출로 묶는 멱등 키 */
  submissionId: z.uuid(),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type SubmitAtBatInput = z.infer<typeof submitAtBatSchema>;

/**
 * 모드별 종료 조건.
 * `Record<PlayMode, SessionGoal>`로 선언해 호출부에서 리터럴 타입으로
 * 좁혀지지 않게 한다 (고정 타석 분기가 살아 있어야 한다).
 */
export const PLAY_MODE_GOAL: Record<PlayMode, SessionGoal> = {
  trial: { kind: 'innings', innings: 1 },
  official_3: { kind: 'innings', innings: 3 },
  full_9: { kind: 'innings', innings: 9 },
  daily: { kind: 'innings', innings: 1 },
  zone_training: { kind: 'pa', pa: 5 },
  ghost: { kind: 'innings', innings: 1 },
};

/** 공식 집계 대상 모드. 체험은 기록을 남기되 공식 집계에서 제외한다. */
export const OFFICIAL_MODES = new Set(['official_3', 'full_9', 'daily', 'ghost']);

/** 회원만 시작할 수 있는 모드 */
export const MEMBER_ONLY_MODES = new Set([
  'official_3',
  'full_9',
  'daily',
  'zone_training',
]);
