import { describe, expect, it } from 'vitest';
import { NEWS, findNews, latestNews } from '@/content/news';

/** 최신 소식 글 형식 (src/content/news.ts). 운영자가 손으로 쓰므로 실수를 잡는다. */
describe('최신 소식', () => {
  it('주소(slug)는 겹치지 않고 영문 소문자·숫자·하이픈이다', () => {
    const slugs = NEWS.map((post) => post.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('날짜는 실제로 있는 YYYY-MM-DD다', () => {
    for (const post of NEWS) {
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(`${post.date}T00:00:00Z`).toISOString().slice(0, 10)).toBe(post.date);
    }
  });

  it('제목·요약·본문이 비어 있지 않다', () => {
    for (const post of NEWS) {
      expect(post.title.trim()).not.toBe('');
      expect(post.summary.trim()).not.toBe('');
      expect(post.body.length).toBeGreaterThan(0);
      for (const paragraph of post.body) expect(paragraph.trim()).not.toBe('');
    }
  });

  it('최신순이다 — 같은 날이면 배열 순서', () => {
    const dates = latestNews().map((post) => post.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(latestNews(2)).toHaveLength(2);
  });

  it('주소로 글을 찾고, 없는 주소는 undefined', () => {
    expect(findNews(NEWS[0]!.slug)).toBe(NEWS[0]);
    expect(findNews('no-such-post')).toBeUndefined();
  });
});
