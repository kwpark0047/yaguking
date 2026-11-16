/**
 * 유입 출처(docs/measurement-plan.md 2단계) — 홍보 링크의 `utm_source`·`utm_campaign`만 읽어 이번 방문 동안 기기에 두고,
 * 비회원으로 처음 시작해 계정이 생길 때 한 번만 `users/{uid}/meta/acquisition`에 쓴다(record.ts).
 *
 * - 출처는 정한 목록만(그 밖은 `etc`), 캠페인은 영소문자·숫자·`-`·`_` 40자까지 — 아무 글이나 저장되지 않게
 * - 이전 페이지 주소(referrer)·경로·브라우저 정보는 읽지 않는다
 * - 처리방침 개정판 시행일(ACQUISITION_START)부터만 동작한다. 그 전에는 주소를 읽지도, 공유 링크에 표시를 붙이지도 않는다
 *
 * 이 파일은 Firebase를 불러오지 않는다(첫 화면 묶음에 들어간다). 쓰기는 record.ts가 필요할 때만 불러온다.
 */

/** 처리방침 개정판 시행일 — ops/admin.mjs·firestore.rules와 같아야 한다(단위 테스트) */
export const ACQUISITION_START = '2026-11-25';

/** 출처 목록 — ops/admin.mjs·firestore.rules와 같아야 한다(단위 테스트) */
export const ACQUISITION_SOURCES = ['instagram', 'threads', 'x', 'openchat', 'community', 'share', 'toss', 'etc'] as const;
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

/** 기기 저장 키(sessionStorage — 창을 닫으면 지워진다). 처리방침 10절 */
export const ACQUISITION_KEY = 'yk_utm';

export const CAMPAIGN_MAX = 40;

export interface Acquisition {
  source: AcquisitionSource;
  campaign: string;
}

const kstDate = (now: number) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);

export function acquisitionStarted(now: number = Date.now()): boolean {
  return kstDate(now) >= ACQUISITION_START;
}

/** 주소의 검색 부분 → 출처·캠페인. 출처 표시가 없으면 null(순수 함수) */
export function parseAcquisition(search: string): Acquisition | null {
  const params = new URLSearchParams(search);
  const raw = params.get('utm_source')?.trim().toLowerCase();
  if (!raw) return null;
  const source = (ACQUISITION_SOURCES as readonly string[]).includes(raw) ? (raw as AcquisitionSource) : 'etc';
  const campaign = (params.get('utm_campaign') ?? '').trim().toLowerCase();
  return { source, campaign: /^[a-z0-9_-]+$/.test(campaign) ? campaign.slice(0, CAMPAIGN_MAX) : '' };
}

/** 주소에서 utm_로 시작하는 칸을 뺀 주소(순수 함수) — 다시 공유되거나 북마크에 남지 않게 */
export function withoutUtm(href: string): string {
  const url = new URL(href);
  for (const name of [...url.searchParams.keys()]) if (name.startsWith('utm_')) url.searchParams.delete(name);
  return url.toString();
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/**
 * 앱을 열 때 한 번(main.tsx). 처음 들어온 주소의 출처만 남긴다 — 이번 방문에 이미 남긴 것이 있으면 그대로 둔다.
 * 주소창에서는 utm_ 칸을 지운다.
 */
export function captureAcquisition(now: number = Date.now()): void {
  if (!acquisitionStarted(now) || typeof location === 'undefined') return;
  const found = parseAcquisition(location.search);
  if (!found) return;
  const store = storage();
  try {
    if (store && store.getItem(ACQUISITION_KEY) === null) store.setItem(ACQUISITION_KEY, JSON.stringify(found));
  } catch {
    // 저장소를 못 쓰면 이번 방문은 출처 없이
  }
  try {
    history.replaceState(history.state, '', withoutUtm(location.href));
  } catch {
    // 주소를 못 바꿔도 기능에는 지장 없다
  }
}

/** 이번 방문에 남긴 출처(없으면 null) */
export function pendingAcquisition(): Acquisition | null {
  try {
    const text = storage()?.getItem(ACQUISITION_KEY);
    if (!text) return null;
    const value = JSON.parse(text) as Partial<Acquisition>;
    if (!(ACQUISITION_SOURCES as readonly string[]).includes(value.source ?? '')) return null;
    const campaign = typeof value.campaign === 'string' && /^[a-z0-9_-]{0,40}$/.test(value.campaign) ? value.campaign : '';
    return { source: value.source as AcquisitionSource, campaign };
  } catch {
    return null;
  }
}

export function clearAcquisition(): void {
  try {
    storage()?.removeItem(ACQUISITION_KEY);
  } catch {
    // 창을 닫으면 어차피 지워진다
  }
}

/**
 * 앱 안 공유 링크에 붙이는 표시(친구가 데려온 사람 세기) — 시행 전이거나 웹 주소가 아니면(토스 미니앱 intoss://) 그대로
 */
export function withShareTag(url: string, campaign: 'daily' | 'room', now: number = Date.now()): string {
  if (!acquisitionStarted(now) || !/^https?:\/\//.test(url)) return url;
  const tagged = new URL(url);
  tagged.searchParams.set('utm_source', 'share');
  tagged.searchParams.set('utm_campaign', campaign);
  return tagged.toString();
}
