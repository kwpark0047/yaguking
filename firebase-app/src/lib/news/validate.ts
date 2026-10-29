/**
 * 최신 소식 글 — 칸 모양 확인(관리자 화면이 저장 전에). 운영자 PC 확인 작업(ops/news.mjs)과 같아야 한다
 * (tests/unit/news.test.ts가 대조). 출처 주소가 실제로 열리는지는 운영자 PC가 매일 본다(브라우저는 다른 사이트를 확인할 수 없다).
 */
export const NEWS_CATEGORIES = ['업데이트', '안내', '이벤트'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
export const NEWS_LIMITS = { title: 80, summary: 200, body: 3000, sourceName: 60, posts: 50 } as const;
export const NEWS_ARCHIVE_DAYS = 365;

export interface NewsPost {
  id: string;
  title: string;
  /** YYYY-MM-DD(한국 날짜) — 이날부터 보인다 */
  date: string;
  category: NewsCategory;
  summary: string;
  /** 문단은 빈 줄로 나눈다 */
  body: string;
  sourceName: string;
  sourceUrl: string;
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** 칸 모양 문제(없으면 null) */
export function newsProblem(post: Partial<Record<keyof NewsPost, unknown>>): string | null {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  if (!text(post.title) || text(post.title).length > NEWS_LIMITS.title) return `제목은 1~${NEWS_LIMITS.title}자`;
  if (!(NEWS_CATEGORIES as readonly unknown[]).includes(post.category)) return '분류를 골라 주세요';
  if (!isCalendarDate(post.date)) return '날짜가 올바르지 않아요';
  if (!text(post.summary) || text(post.summary).length > NEWS_LIMITS.summary) return `요약은 1~${NEWS_LIMITS.summary}자`;
  if (!text(post.body) || text(post.body).length > NEWS_LIMITS.body) return `본문은 1~${NEWS_LIMITS.body}자`;
  if (!text(post.sourceName) || text(post.sourceName).length > NEWS_LIMITS.sourceName) return `출처 이름은 1~${NEWS_LIMITS.sourceName}자`;
  if (typeof post.sourceUrl !== 'string' || !/^https:\/\/[^\s]+$/.test(post.sourceUrl)) return '출처 주소는 https://로 시작해야 해요';
  return null;
}

/** 본문 → 문단 */
export const paragraphsOf = (body: string) => body.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
