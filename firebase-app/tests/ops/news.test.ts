import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runNews, seedNews } from '../../ops/news.mjs';

/** 최신 소식 매일 확인(ops/news.mjs) — Firestore 에뮬레이터에서. 출처 주소는 가짜 fetch로(인터넷 없이) */
const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJECT = 'demo-yaguking';
const now = Date.UTC(2026, 9, 29, 3) - 9 * 3_600_000 + 9 * 3_600_000; // 2026-10-29 03:00 UTC = 12:00 KST
const post = (id: string, patch: object = {}) => ({
  id,
  title: `글 ${id}`,
  date: '2026-10-28',
  category: '업데이트',
  summary: '요약',
  body: '본문',
  sourceName: '출처',
  sourceUrl: `https://ok.example/${id}`,
  hidden: false,
  ...patch,
});
/** ok.example은 200, dead.example은 404, 그 밖은 연결 실패 */
const fakeFetch = (async (url: string) => {
  if (url.startsWith('https://ok.example/')) return new Response(null, { status: 200 });
  if (url.startsWith('https://dead.example/')) return new Response(null, { status: 404 });
  throw new TypeError('fetch failed');
}) as typeof fetch;

describe.skipIf(!emulated)('최신 소식 확인(에뮬레이터)', () => {
  let app: App;
  let db: Firestore;

  beforeAll(() => {
    app = initializeApp({ projectId: PROJECT }, 'news-test');
    db = getFirestore(app);
  });
  afterAll(async () => {
    await deleteApp(app);
  });
  beforeEach(async () => {
    await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  });

  it('글마다 출처·날짜를 확인해 통과한 글만 공개 문서에(최신순), 이유는 관리자 문서에', async () => {
    await db.doc('adminConfig/news').set({
      posts: [
        post('a', { date: '2026-10-20' }),
        post('b', { date: '2026-10-29' }),
        post('hidden', { hidden: true }),
        post('future', { date: '2026-11-05' }),
        post('old', { date: '2025-10-01' }),
        post('dead', { sourceUrl: 'https://dead.example/x' }),
        post('down', { sourceUrl: 'https://down.example/x' }),
        post('bad', { category: '루머' }),
      ],
    });
    expect(await runNews({ db, now, fetchImpl: fakeFetch })).toEqual({ posts: 8, shown: 2, failed: 6 });
    const shown = (await db.doc('public/news').get()).data()!;
    expect(shown.posts.map((item: { id: string }) => item.id)).toEqual(['b', 'a']);
    expect(shown.posts[0]).not.toHaveProperty('hidden');
    const checks = (await db.doc('adminConfig/news').get()).get('checks');
    expect(checks.b).toMatchObject({ ok: true });
    expect(checks.future.reason).toContain('예약');
    expect(checks.old.reason).toContain('1년');
    expect(checks.dead.reason).toContain('404');
    expect(checks.down.ok).toBe(false);
    expect(checks.bad.reason).toContain('분류');
    expect(checks.hidden.reason).toBe('숨김');

    // 예약한 날이 되면 저절로 올라가고, 지운 글의 확인 결과는 남지 않는다
    await db.doc('adminConfig/news').update({ posts: [post('future', { date: '2026-11-05' })] });
    await runNews({ db, now: now + 7 * 86_400_000, fetchImpl: fakeFetch });
    expect((await db.doc('public/news').get()).get('posts').map((item: { id: string }) => item.id)).toEqual(['future']);
    expect(Object.keys((await db.doc('adminConfig/news').get()).get('checks'))).toEqual(['future']);
  });

  it('처음 글은 글이 하나도 없을 때만 넣는다', async () => {
    expect(await seedNews({ db, posts: [post('s1'), post('s2', { title: '' })] })).toEqual({ seeded: 1, skipped: 1 });
    expect(await seedNews({ db, posts: [post('s3')] })).toMatchObject({ seeded: 0 });
    expect((await db.doc('adminConfig/news').get()).get('posts').map((item: { id: string }) => item.id)).toEqual(['s1']);
  });
});
