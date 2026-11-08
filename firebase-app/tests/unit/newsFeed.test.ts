import { describe, expect, it } from 'vitest';
import { BLOCKED_HOSTS as OPS_BLOCKED, cleanItems, feedUrlProblem as opsFeedUrlProblem, parseFeed, plainText, robotsAllows } from '../../ops/newsFeed.mjs';
import { BLOCKED_HOSTS, feedProblem, feedUrlProblem } from '@/lib/news/feeds';
import { draftFromNews, nearbyNumbers } from '@/lib/news/quizDraft';

const NOW = Date.parse('2026-11-08T12:00:00+09:00');
const RSS = `<?xml version="1.0"?><rss><channel><title>야구</title>
<item><title><![CDATA[한화, 한국시리즈 <b>우승</b>]]></title><link>https://news.example/a</link><pubDate>Sat, 07 Nov 2026 13:00:00 +0900</pubDate><description>&lt;p&gt;한화가 4승 1패로&amp;nbsp;우승&lt;/p&gt;</description></item>
<item><title>링크 없는 항목</title><description>x</description></item>
<item><title>http 링크</title><link>http://news.example/b</link></item>
<item><title>오래된 소식</title><link>https://news.example/old</link><pubDate>Mon, 01 Jun 2026 10:00:00 +0900</pubDate></item>
</channel></rss>`;
const ATOM = `<feed><entry><title>LG &amp; 두산 경기</title><link rel="alternate" href="https://atom.example/1"/><updated>2026-11-08T01:00:00Z</updated><summary>요약</summary></entry></feed>`;

describe('피드 읽기', () => {
  it('RSS·Atom 항목의 제목·링크·시각·요약을 읽고 태그·엔티티를 푼다', () => {
    const [first] = parseFeed(RSS);
    expect(first).toEqual({ title: '한화, 한국시리즈 우승', link: 'https://news.example/a', published: 'Sat, 07 Nov 2026 13:00:00 +0900', summary: '한화가 4승 1패로 우승' });
    expect(parseFeed(ATOM)[0]).toMatchObject({ title: 'LG & 두산 경기', link: 'https://atom.example/1', summary: '요약' });
    expect(plainText('&#xD55C;&#54868;')).toBe('한화');
  });

  it('https 링크·제목이 있는 최근 14일 항목만, 요약은 200자로 자른다', () => {
    const feed = { id: 'f1', name: '테스트 신문' };
    const long = parseFeed(RSS).map((item, index) => (index === 0 ? { ...item, summary: '가'.repeat(500) } : item));
    const items = cleanItems(long, { now: NOW, feed });
    expect(items.map((item: { link: string }) => item.link)).toEqual(['https://news.example/a']);
    expect(items[0]!.summary).toHaveLength(200);
    expect(items[0]).toMatchObject({ feedId: 'f1', feedName: '테스트 신문' });
  });
});

describe('robots.txt', () => {
  it('우리 이름 무리를 먼저, 없으면 * 를 본다. 긴 규칙이 이긴다', () => {
    expect(robotsAllows('User-agent: *\nDisallow: /', '/rss')).toBe(false);
    expect(robotsAllows('User-agent: *\nDisallow: /\n\nUser-agent: YaguKingFeedBot\nAllow: /rss', '/rss/baseball')).toBe(true);
    expect(robotsAllows('User-agent: *\nDisallow: /private', '/rss')).toBe(true);
    expect(robotsAllows('User-agent: *\nDisallow: /rss\nAllow: /rss/sports', '/rss/sports.xml')).toBe(true);
    expect(robotsAllows('User-agent: *\nDisallow:', '/anything')).toBe(true);
    expect(robotsAllows('User-agent: Googlebot\nAllow: /\nUser-agent: *\nDisallow: /', '/rss')).toBe(false);
    expect(robotsAllows('', '/rss')).toBe(true);
  });

  it('KBO 공식 사이트의 실제 규칙(그 밖의 봇 전체 차단)이면 막힌다', () => {
    expect(robotsAllows('User-agent: Googlebot\nDisallow: /ws/\nUser-agent: *\nDisallow: /', '/Schedule/GameCenter/Main.aspx')).toBe(false);
  });
});

describe('피드 주소', () => {
  it('KBO 공식 사이트·http는 등록할 수 없다 — 화면과 운영 작업이 같다', () => {
    for (const url of ['https://www.koreabaseball.com/rss.xml', 'https://m.koreabaseball.com/x', 'http://news.example/rss', 'not a url', 'https://news.example/rss']) {
      expect(feedUrlProblem(url)).toBe(opsFeedUrlProblem(url));
    }
    expect(feedUrlProblem('https://koreabaseball.com/a')).toMatch(/약관/);
    expect(feedUrlProblem('https://news.example/rss')).toBeNull();
    expect(BLOCKED_HOSTS).toEqual(OPS_BLOCKED);
  });

  it('이용 조건 주소가 있어야 한다', () => {
    const feed = { id: 'a', name: '신문', url: 'https://news.example/rss', termsUrl: 'https://news.example/terms', termsChecked: true, enabled: true };
    expect(feedProblem(feed)).toBeNull();
    expect(feedProblem({ ...feed, termsUrl: '' })).toMatch(/이용 조건/);
  });
});

describe('소식 → 문제 초안', () => {
  const source = { title: '한화, 한국시리즈 우승', link: 'https://news.example/a', feedName: '테스트 신문', publishedAt: NOW };
  const base = { stem: '2026 한국시리즈에서 우승한 팀은?', difficulty: 'easy' as const, explanation: '한화가 4승 1패로 우승했다.', seed: 's' };

  it('구단: 정답 + 다른 구단 3개, 출처·기준일은 소식에서', () => {
    const { draft, problem } = draftFromNews(source, { ...base, kind: 'team', correct: '한화' });
    expect(problem).toBeNull();
    const texts = draft!.question.options.map((option) => option.text);
    expect(texts).toContain('한화 이글스');
    expect(new Set(texts).size).toBe(4);
    expect(draft!.question.options.find((option) => option.label === draft!.key.correct)?.text).toBe('한화 이글스');
    expect(draft!.key).toMatchObject({ sourceName: '테스트 신문', sourceUrl: 'https://news.example/a', recordAsOf: '2026-11-08' });
    expect(JSON.stringify(draft!.question)).not.toContain('correct');
  });

  it('숫자: 가까운 숫자 3개, 같은 단위, 0 아래 없음', () => {
    const { draft } = draftFromNews(source, { ...base, kind: 'number', correct: '4', unit: '승' });
    const texts = draft!.question.options.map((option) => option.text);
    expect(texts).toContain('4승');
    expect(texts.every((text) => /^\d+승$/.test(text))).toBe(true);
    expect(new Set(texts).size).toBe(4);
    for (let value = 0; value < 30; value += 1) {
      const wrong = nearbyNumbers(value, () => 0.5);
      expect(wrong).toHaveLength(3);
      expect(wrong.every((number) => number >= 0 && number !== value)).toBe(true);
    }
  });

  it('직접: 오답 3개가 있어야 하고, 겹치면 막는다', () => {
    expect(draftFromNews(source, { ...base, kind: 'text', correct: '선수가', wrong: ['선수나'] }).problem).toMatch(/오답/);
    expect(draftFromNews(source, { ...base, kind: 'text', correct: '선수가', wrong: ['선수가', '선수나', '선수다'] }).problem).toMatch(/서로/);
    expect(draftFromNews(source, { ...base, kind: 'text', correct: '선수가', wrong: ['선수나', '선수다', '선수라'] }).draft).not.toBeNull();
  });

  it('문제·해설이 비거나 잘못된 정답이면 막는다', () => {
    expect(draftFromNews(source, { ...base, kind: 'team', correct: '없는 팀' }).problem).toMatch(/구단/);
    expect(draftFromNews(source, { ...base, kind: 'number', correct: '-1' }).problem).toMatch(/정수/);
    expect(draftFromNews(source, { ...base, stem: '', kind: 'team', correct: '한화' }).problem).toMatch(/문제/);
    expect(draftFromNews(source, { ...base, explanation: '', kind: 'team', correct: '한화' }).problem).toMatch(/해설/);
  });

  it('같은 씨앗이면 같은 초안', () => {
    expect(draftFromNews(source, { ...base, kind: 'team', correct: '한화' })).toEqual(draftFromNews(source, { ...base, kind: 'team', correct: '한화' }));
  });
});
