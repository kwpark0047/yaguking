import { countReads } from '@/lib/firebase/meter';
import { NEWS_CATEGORIES, type NewsPost } from '@/lib/news/validate';
import { decode, publicDocumentUrl, type RestValue } from './home';

/**
 * 최신 소식(public/news) 읽기 — 운영자 PC가 매일 글마다 출처·날짜를 확인해 통과한 글만 쓴다(ops/news.mjs, docs/news.md).
 * 공지(public/home)처럼 **Firestore SDK 없이** REST로 읽고, 앱을 연 동안 10분 기억한다(읽기 1).
 */
const CACHE_MS = 10 * 60 * 1000;

export function parsePublicNews(document: { fields?: Record<string, RestValue> } | null): NewsPost[] {
  const raw = decode({ mapValue: { fields: document?.fields ?? {} } }) as { posts?: unknown };
  const posts = Array.isArray(raw.posts) ? raw.posts : [];
  return posts.flatMap((item): NewsPost[] => {
    const post = item as Record<string, unknown>;
    const strings = ['id', 'title', 'date', 'summary', 'body', 'sourceName', 'sourceUrl'] as const;
    if (strings.some((key) => typeof post[key] !== 'string')) return [];
    if (!(NEWS_CATEGORIES as readonly unknown[]).includes(post.category)) return [];
    if (!String(post.sourceUrl).startsWith('https://')) return [];
    return [post as unknown as NewsPost];
  });
}

let memory: { at: number; posts: NewsPost[] } | null = null;
let inFlight: Promise<NewsPost[]> | null = null;

/** 최신 소식(날짜 최신순). 실패하면 빈 목록 — 소식이 없어도 앱은 돈다 */
export function loadNews(): Promise<NewsPost[]> {
  if (memory && Date.now() - memory.at < CACHE_MS) return Promise.resolve(memory.posts);
  inFlight ??= fetch(publicDocumentUrl('news'))
    .then(async (response) => {
      countReads('publicNews', 1);
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(String(response.status));
      return parsePublicNews((await response.json()) as { fields?: Record<string, RestValue> });
    })
    .then((posts) => {
      memory = { at: Date.now(), posts };
      return posts;
    })
    .catch(() => [] as NewsPost[])
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
