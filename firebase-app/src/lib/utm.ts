/**
 * UTM 파라미터 캡처 및 영속화.
 *
 * 마케팅 캠페인별 유입 효과를 측정하기 위해 URL의 UTM 파라미터를
 * 추출하고, 세션 스토리지에 저장하여 페이지 이동 후에도 유지한다.
 * 이벤트 추적(analytics.ts)에서 읽어 이벤트와 함께 Firestore에 기록한다.
 */

export interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const SESSION_KEY = 'yk_utm';

/** 현재 URL에서 UTM 파라미터 추출 */
export function captureUtm(): UtmParams | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const utm: UtmParams = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) utm[key.replace('utm_', '') as keyof UtmParams] = value;
  }
  return Object.keys(utm).length > 0 ? utm : undefined;
}

/** UTM 파라미터를 세션 스토리지에 저장 */
export function persistUtm(): void {
  if (typeof window === 'undefined') return;
  const utm = captureUtm();
  if (utm) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(utm));
  }
}

/** 저장된 UTM 파라미터 읽기 */
export function readStoredUtm(): UtmParams | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as UtmParams;
  } catch {
    return undefined;
  }
}

/** UTM 파라미터를 쿼리 문자열로 변환(디버깅용) */
export function utmToString(utm: UtmParams): string {
  const params = new URLSearchParams();
  if (utm.source) params.set('utm_source', utm.source);
  if (utm.medium) params.set('utm_medium', utm.medium);
  if (utm.campaign) params.set('utm_campaign', utm.campaign);
  if (utm.term) params.set('utm_term', utm.term);
  if (utm.content) params.set('utm_content', utm.content);
  return params.toString();
}

/** 현재 페이지의 UTM 포함 여부 */
export function hasUtm(): boolean {
  if (typeof window === 'undefined') return false;
  return UTM_KEYS.some((key) => new URLSearchParams(window.location.search).has(key));
}
