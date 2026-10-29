import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as job from '../../ops/news.mjs';
import { NEWS_ARCHIVE_DAYS, NEWS_CATEGORIES, NEWS_LIMITS, isCalendarDate, newsProblem, paragraphsOf } from '@/lib/news/validate';
import { parsePublicNews } from '@/lib/public/news';

/** 최신 소식(docs/news.md) — 칸 모양 확인이 관리자 화면(validate.ts)과 운영자 PC(ops/news.mjs)에서 같은지, 처음 글이 올바른지 */
const good = {
  id: 'n1',
  title: '새 기능',
  date: '2026-10-29',
  category: '업데이트',
  summary: '요약',
  body: '본문',
  sourceName: '야구왕',
  sourceUrl: 'https://yaguking.web.app/',
};

describe('칸 모양', () => {
  const cases: Record<string, unknown>[] = [
    good,
    { ...good, title: '' },
    { ...good, title: 'x'.repeat(NEWS_LIMITS.title + 1) },
    { ...good, category: '리그 소식' },
    { ...good, date: '2026-02-30' },
    { ...good, date: '2026-1-5' },
    { ...good, summary: ' ' },
    { ...good, body: 'x'.repeat(NEWS_LIMITS.body + 1) },
    { ...good, sourceName: '' },
    { ...good, sourceUrl: 'http://example.com' },
    { ...good, sourceUrl: 'https://exa mple.com' },
    { ...good, sourceUrl: undefined },
  ];

  it('출처(이름·https 주소)와 달력에 있는 날짜가 꼭 있어야 한다', () => {
    expect(newsProblem(good)).toBeNull();
    expect(cases.slice(1).every((post) => newsProblem(post) !== null)).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2027-02-29')).toBe(false);
  });

  it('운영자 PC 확인과 같은 결과·같은 기준', () => {
    for (const post of cases) expect(job.newsProblem(post)).toBe(newsProblem(post));
    expect(job.NEWS_CATEGORIES).toEqual([...NEWS_CATEGORIES]);
    expect(job.NEWS_LIMITS).toEqual(NEWS_LIMITS);
    expect(job.NEWS_ARCHIVE_DAYS).toBe(NEWS_ARCHIVE_DAYS);
  });

  it('날짜: 오늘 이하면 올리고, 미래는 예약, 1년 지나면 내린다', () => {
    expect(job.dateStatus('2026-10-29', '2026-10-29')).toBe('ok');
    expect(job.dateStatus('2026-10-30', '2026-10-29')).toBe('scheduled');
    expect(job.dateStatus('2025-10-28', '2026-10-29')).toBe('archived');
    expect(job.kstToday(Date.UTC(2026, 9, 28, 15))).toBe('2026-10-29'); // 한국 자정
  });

  it('본문은 빈 줄로 문단을 나눈다', () => {
    expect(paragraphsOf('첫 문단\n\n둘째 문단\n  \n셋째')).toEqual(['첫 문단', '둘째 문단', '셋째']);
  });
});

describe('공개 문서 읽기', () => {
  it('모양이 틀린 글(분류·https 아님·빠진 칸)은 버린다', () => {
    const value = (post: Record<string, string>) => ({ mapValue: { fields: Object.fromEntries(Object.entries(post).map(([key, text]) => [key, { stringValue: text }])) } });
    const posts = parsePublicNews({
      fields: {
        posts: { arrayValue: { values: [value(good), value({ ...good, id: 'n2', category: '루머' }), value({ ...good, id: 'n3', sourceUrl: 'http://x' })] } },
      },
    });
    expect(posts.map((post) => post.id)).toEqual(['n1']);
    expect(parsePublicNews(null)).toEqual([]);
  });
});

describe('처음 글(ops/news-seed.json)', () => {
  const seed = JSON.parse(readFileSync(join(__dirname, '../../ops/news-seed.json'), 'utf8')) as Record<string, unknown>[];

  it('모두 모양이 맞고, ID가 겹치지 않고, 리그 경기 결과를 옮겨 오지 않는다', () => {
    for (const post of seed) expect(newsProblem(post), String(post.id)).toBeNull();
    expect(new Set(seed.map((post) => post.id)).size).toBe(seed.length);
    for (const post of seed) expect(['업데이트', '안내', '이벤트']).toContain(post.category);
  });
});
