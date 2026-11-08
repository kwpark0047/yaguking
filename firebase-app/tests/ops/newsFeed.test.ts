import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FEED_USER_AGENT, itemId, runNewsFeed } from '../../ops/newsFeed.mjs';

/** 소식 가져오기 — 에뮬레이터 + 가짜 fetch(실제 사이트에 요청하지 않는다) */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const NOW = Date.parse('2026-11-08T00:05:00+09:00');
const rss = (link: string, title = '야구 소식') => `<rss><channel><item><title>${title}</title><link>${link}</link><pubDate>Sat, 07 Nov 2026 20:00:00 +0900</pubDate><description>요약</description></item></channel></rss>`;

describe.skipIf(!emulated)('소식 가져오기 운영 작업', () => {
  let app: App;
  let db: Firestore;
  const requests: { url: string; agent: string }[] = [];
  const pages: Record<string, { status: number; body: string } | 'throw'> = {};
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    requests.push({ url, agent: String((init?.headers as Record<string, string> | undefined)?.['User-Agent'] ?? '') });
    const page = pages[url];
    if (page === 'throw') throw new Error('연결 실패');
    if (!page) return new Response('', { status: 404 });
    return new Response(page.body, { status: page.status });
  }) as typeof fetch;

  const feed = (id: string, url: string, patch: object = {}) => ({ id, name: `피드 ${id}`, url, termsUrl: 'https://terms.example/', termsChecked: true, enabled: true, ...patch });

  beforeAll(() => {
    app = initializeApp({ projectId: 'demo-yaguking' }, 'news-feed-test');
    db = getFirestore(app);
  });
  beforeEach(async () => {
    await db.recursiveDelete(db.collection('newsItems'));
    await db.doc('adminConfig/newsFeedRuns').delete();
    requests.length = 0;
    for (const key of Object.keys(pages)) delete pages[key];
  });
  afterAll(async () => {
    await deleteApp(app);
  });

  it('조건을 지킨 피드만 읽고, 이름을 밝히고, 다시 돌려도 겹치지 않는다', async () => {
    pages['https://ok.example/rss'] = { status: 200, body: rss('https://ok.example/a') };
    pages['https://blocked.example/robots.txt'] = { status: 200, body: 'User-agent: *\nDisallow: /' };
    pages['https://blocked.example/rss'] = { status: 200, body: rss('https://blocked.example/a') };
    pages['https://down.example/rss'] = 'throw';
    await db.doc('adminConfig/newsFeeds').set({
      feeds: [
        feed('ok', 'https://ok.example/rss'),
        feed('robots', 'https://blocked.example/rss'),
        feed('unchecked', 'https://ok.example/rss', { termsChecked: false }),
        feed('off', 'https://ok.example/rss', { enabled: false }),
        feed('kbo', 'https://www.koreabaseball.com/rss'),
        feed('down', 'https://down.example/rss'),
      ],
    });

    const report = await runNewsFeed({ db, fetchImpl: fakeFetch, now: NOW });
    expect(report.feeds.map((item) => item.status)).toEqual(['ok', 'robots', 'terms-unchecked', 'off', 'blocked', 'fetch-failed']);
    expect(report.added).toBe(1);
    expect(requests.some((request) => request.url.includes('koreabaseball'))).toBe(false);
    expect(requests.some((request) => request.url === 'https://blocked.example/rss')).toBe(false);
    expect(requests.every((request) => request.agent === FEED_USER_AGENT)).toBe(true);

    const item = await db.doc(`newsItems/${itemId('https://ok.example/a')}`).get();
    expect(item.data()).toMatchObject({ title: '야구 소식', link: 'https://ok.example/a', summary: '요약', feedName: '피드 ok' });

    const again = await runNewsFeed({ db, fetchImpl: fakeFetch, now: NOW });
    expect(again.added).toBe(0);
    expect((await db.collection('newsItems').get()).size).toBe(1);
    expect((await db.doc('adminConfig/newsFeedRuns').get()).get('runs')).toHaveLength(2);
  });

  it('14일 지난 항목을 지운다', async () => {
    await db.doc('adminConfig/newsFeeds').set({ feeds: [] });
    await db.doc('newsItems/old').set({ title: '옛 소식', publishedAt: Timestamp.fromMillis(NOW - 15 * 86_400_000) });
    await db.doc('newsItems/new').set({ title: '새 소식', publishedAt: Timestamp.fromMillis(NOW - 86_400_000) });
    const report = await runNewsFeed({ db, fetchImpl: fakeFetch, now: NOW });
    expect(report.removed).toBe(1);
    expect((await db.doc('newsItems/old').get()).exists).toBe(false);
    expect((await db.doc('newsItems/new').get()).exists).toBe(true);
  });
});
