/**
 * 소식 피드 설정(관리자 화면) — 운영자 PC 쪽 검사(ops/newsFeed.mjs feedUrlProblem)와 같아야 한다(tests/unit/newsFeed.test.ts가 대조).
 * KBO 공식 사이트는 약관 제14조·robots.txt가 자동 수집을 막아 등록할 수 없다.
 */
export const BLOCKED_HOSTS = ['koreabaseball.com', 'www.koreabaseball.com', 'm.koreabaseball.com', 'eng.koreabaseball.com'];
export const MAX_FEEDS = 20;

export interface NewsFeed {
  id: string;
  name: string;
  url: string;
  /** 이용 조건을 확인한 곳(약관·RSS 안내 주소) */
  termsUrl: string;
  /** 관리자가 이용 조건을 확인했다고 표시해야 수집한다 */
  termsChecked: boolean;
  enabled: boolean;
}

export function feedUrlProblem(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return '주소 형식이 틀렸다';
  }
  if (parsed.protocol !== 'https:') return 'https 주소만 쓴다';
  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`))) return 'KBO 공식 사이트는 약관상 자동 수집을 할 수 없다';
  return null;
}

/** 저장 전 확인 — 문제가 없으면 null */
export function feedProblem(feed: NewsFeed): string | null {
  if (!feed.name.trim() || feed.name.length > 40) return '피드 이름을 40자 안으로 적어 주세요.';
  const urlProblem = feedUrlProblem(feed.url);
  if (urlProblem) return `피드 주소: ${urlProblem}`;
  if (!/^https:\/\/\S+$/.test(feed.termsUrl)) return '이용 조건을 확인한 주소(https)를 적어 주세요.';
  return null;
}
