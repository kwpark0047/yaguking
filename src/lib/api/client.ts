import type { ApiEnvelope, PlayStateDto, StartSessionDto, SubmitAtBatDto } from '@/types/api';

/**
 * 브라우저용 API 클라이언트.
 *
 * **자동 재시도를 하지 않는다.** 제출 실패 시 같은 요청을 다시 보내는 대신
 * `fetchPlayState`로 확정 여부를 먼저 확인한다 (08 문서 §4.2).
 */

export interface ApiFailure {
  ok: false;
  code: string;
  message: string;
  /** 서버 로그와 대조할 식별자. 오류 화면에 접어서 노출한다 (08 문서 §9). */
  requestId?: string;
  detail?: unknown;
}

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

async function request<T>(
  input: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    return { ok: false, code: 'NETWORK', message: '네트워크에 연결할 수 없습니다.' };
  }

  let body: ApiEnvelope<T>;
  try {
    body = (await response.json()) as ApiEnvelope<T>;
  } catch {
    return { ok: false, code: 'INTERNAL_ERROR', message: '응답을 해석할 수 없습니다.' };
  }

  if (body.success) return { ok: true, data: body.data };
  return {
    ok: false,
    code: body.error.code,
    message: body.error.message,
    requestId: body.error.requestId,
    detail: body.error.detail,
  };
}

export function startPlaySession(
  mode: 'trial' | 'official_3' | 'full_9' | 'daily' = 'trial',
): Promise<ApiResult<StartSessionDto>> {
  return request<StartSessionDto>('/api/v1/play/sessions', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

export function fetchPlayState(sessionId: string): Promise<ApiResult<PlayStateDto>> {
  return request<PlayStateDto>(`/api/v1/play/sessions/${sessionId}`);
}

export function submitAtBatRequest(
  sessionId: string,
  /** optionId를 생략하면 시간초과 확정 요청이다 (서버가 마감을 재확인한다). */
  body: { sequence: number; optionId?: string; submissionId: string },
): Promise<ApiResult<SubmitAtBatDto>> {
  return request<SubmitAtBatDto>(`/api/v1/play/sessions/${sessionId}/at-bats`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function abandonPlaySession(
  sessionId: string,
): Promise<ApiResult<{ status: string }>> {
  return request(`/api/v1/play/sessions/${sessionId}/abandon`, { method: 'POST' });
}
