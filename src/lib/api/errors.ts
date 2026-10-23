/**
 * 오류 코드와 HTTP 상태.
 * V1(03 문서 §8) 코드를 승계하고 V2 추가분(07 문서 §6.3)을 합친다.
 */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  MEMBERSHIP_REQUIRED: 403,
  NOT_FOUND: 404,
  ALREADY_SUBMITTED: 409,
  SEQUENCE_MISMATCH: 409,
  SESSION_FINISHED: 409,
  FAN_LEAGUE_NOT_READY: 409,
  ROOM_FULL: 409,
  ROOM_EXPIRED: 410,
  CHALLENGE_EXPIRED: 410,
  ANSWER_DEADLINE_EXCEEDED: 422,
  RATE_LIMITED: 429,
  GUEST_TRIAL_EXHAUSTED: 429,
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: '요청 값을 확인해 주세요.',
  UNAUTHORIZED: '로그인이 필요합니다.',
  FORBIDDEN: '권한이 없습니다.',
  MEMBERSHIP_REQUIRED: '회원만 이용할 수 있습니다.',
  NOT_FOUND: '대상을 찾을 수 없습니다.',
  ALREADY_SUBMITTED: '이미 제출된 타석입니다.',
  SEQUENCE_MISMATCH: '현재 타석과 다릅니다.',
  SESSION_FINISHED: '이미 종료된 경기입니다.',
  FAN_LEAGUE_NOT_READY: '리그 준비 중입니다.',
  ROOM_FULL: '방이 가득 찼습니다.',
  ROOM_EXPIRED: '방이 만료되었습니다.',
  CHALLENGE_EXPIRED: '도전장이 만료되었습니다.',
  ANSWER_DEADLINE_EXCEEDED: '답안 제출 시간이 종료되었습니다.',
  RATE_LIMITED: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  GUEST_TRIAL_EXHAUSTED: '오늘 체험 가능한 이닝을 모두 사용했습니다.',
  INTERNAL_ERROR: '처리 중 오류가 발생했습니다.',
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  /** 오류와 함께 돌려줄 추가 데이터 (예: 마감 초과 시 확정된 타석 결과) */
  readonly detail?: unknown;

  constructor(code: ErrorCode, message?: string, detail?: unknown) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.detail = detail;
  }
}
