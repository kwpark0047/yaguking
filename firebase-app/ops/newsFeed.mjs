/**
 * 최신 소식 가져오기 — 운영자 PC 매일 작업(docs/daily-kbo-quiz/05-news-feed.md, 저장소 맨 위 docs).
 *
 * 관리자가 등록하고 **이용 조건을 확인했다고 표시한 언론사 RSS만** 하루 한 번 읽는다(운영자 결정 2026-11-08).
 * - KBO 공식 사이트(koreabaseball.com)는 약관 제14조·robots.txt가 자동 수집을 막으므로 등록할 수 없다
 * - 피드마다 robots.txt를 먼저 확인하고, 막혀 있으면 건너뛴다. 자신을 밝히는 User-Agent를 쓴다
 * - 제목·링크·발행 시각·짧은 요약(200자)만 남긴다. 기사 전문은 가져오지 않는다. 관리자만 본다(newsItems)
 * - 14일 지난 항목은 지운다
 *
 * 문제로 만드는 일은 관리자 화면에서 사람이 한다(src/lib/news/quizDraft.ts — AI 없이 틀로 초안).
 */
import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const FEED_USER_AGENT = 'YaguKingFeedBot/1.0 (+https://yaguking.web.app/news; 하루 1회 RSS)';
export const FEED_LIMITS = { feeds: 20, itemsPerFeed: 30, summary: 200, keepDays: 14, title: 200 };
/** 등록하면 안 되는 곳 — 약관이 자동 수집을 금지한다 */
export const BLOCKED_HOSTS = ['koreabaseball.com', 'www.koreabaseball.com', 'm.koreabaseball.com', 'eng.koreabaseball.com'];
const DAY = 86_400_000;
const RUNS_KEPT = 30;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) ? String.fromCodePoint(value) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** 태그를 지우고 공백을 한 칸으로 */
export function plainText(raw) {
  const unwrapped = String(raw ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // 많은 피드가 HTML을 엔티티로 감싸 보낸다(&lt;p&gt;) — 풀고, 태그를 지우고, 남은 엔티티(&amp;nbsp;)를 한 번 더 푼다
  const stripped = decodeEntities(unwrapped).replace(/<[^>]*>/g, ' ');
  return decodeEntities(stripped).replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1] : '';
}

/** RSS 2.0·Atom의 항목만 읽는다. 외부 라이브러리를 쓰지 않는다(필요한 칸이 넷뿐) */
export function parseFeed(xml) {
  const text = String(xml ?? '');
  const items = [];
  for (const [, block] of text.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    items.push({ title: plainText(tag(block, 'title')), link: plainText(tag(block, 'link')), published: plainText(tag(block, 'pubDate') || tag(block, 'dc:date')), summary: plainText(tag(block, 'description')) });
  }
  for (const [, block] of text.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)) {
    const href = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ?? '';
    items.push({ title: plainText(tag(block, 'title')), link: decodeEntities(href), published: plainText(tag(block, 'published') || tag(block, 'updated')), summary: plainText(tag(block, 'summary') || tag(block, 'content')) });
  }
  return items;
}

/** 등록할 수 있는 피드 주소인가 — 문제가 없으면 null */
export function feedUrlProblem(url) {
  let parsed;
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

/**
 * robots.txt가 이 경로를 허락하는가. 우리 이름(YaguKingFeedBot) 무리가 있으면 그것을, 없으면 `*`를 본다.
 * 가장 긴 규칙이 이긴다(같으면 Allow). robots.txt가 없으면(4xx) 허락, 받지 못하면(5xx·연결 실패) 막힌 것으로 본다.
 */
export function robotsAllows(robotsText, path, agent = 'yagukingfeedbot') {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const rawLine of String(robotsText).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;
    const [, field, value] = match;
    const key = field.toLowerCase();
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.trim().toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (current && (key === 'allow' || key === 'disallow')) current.rules.push({ allow: key === 'allow', path: value.trim() });
  }
  const mine = groups.filter((group) => group.agents.some((name) => name !== '*' && agent.includes(name)));
  const chosen = mine.length > 0 ? mine : groups.filter((group) => group.agents.includes('*'));
  let best = null;
  for (const rule of chosen.flatMap((group) => group.rules)) {
    if (!rule.path) continue; // "Disallow:" 빈 값은 전부 허락
    const pattern = new RegExp(`^${rule.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
    if (!pattern.test(path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

async function robotsCheck(url, fetchImpl) {
  const parsed = new URL(url);
  try {
    const response = await fetchImpl(`${parsed.origin}/robots.txt`, { headers: { 'User-Agent': FEED_USER_AGENT }, signal: AbortSignal.timeout(10_000) });
    if (response.status >= 400 && response.status < 500) return { ok: true };
    if (!response.ok) return { ok: false, reason: `robots.txt 응답 ${response.status}` };
    return robotsAllows(await response.text(), parsed.pathname + parsed.search) ? { ok: true } : { ok: false, reason: 'robots.txt가 막음' };
  } catch (error) {
    return { ok: false, reason: `robots.txt 확인 실패(${error?.name ?? error})` };
  }
}

export const itemId = (link) => createHash('sha256').update(link).digest('hex').slice(0, 20);

/** 항목 정리 — 링크(https)·제목이 없거나 너무 오래된 것은 뺀다 */
export function cleanItems(items, { now, feed }) {
  const out = [];
  const seen = new Set();
  for (const item of items.slice(0, FEED_LIMITS.itemsPerFeed)) {
    if (!item.title || !/^https:\/\//.test(item.link) || seen.has(item.link)) continue;
    seen.add(item.link);
    const published = Date.parse(item.published);
    const publishedAt = Number.isFinite(published) ? published : now;
    if (publishedAt < now - FEED_LIMITS.keepDays * DAY) continue;
    out.push({
      id: itemId(item.link),
      title: item.title.slice(0, FEED_LIMITS.title),
      link: item.link,
      publishedAt: Math.min(publishedAt, now),
      summary: item.summary.slice(0, FEED_LIMITS.summary),
      feedId: feed.id,
      feedName: feed.name,
    });
  }
  return out;
}

/** 하루 한 번. 피드 하나가 실패해도 나머지는 돈다. 결과는 adminConfig/newsFeedRuns에 남긴다 */
export async function runNewsFeed({ db, fetchImpl = fetch, now = Date.now() }) {
  const config = await db.doc('adminConfig/newsFeeds').get();
  const feeds = (config.get('feeds') ?? []).slice(0, FEED_LIMITS.feeds);
  const report = { at: now, feeds: [], added: 0, removed: 0 };

  for (const feed of feeds) {
    const entry = { id: feed.id, name: feed.name, status: 'ok', items: 0, added: 0 };
    report.feeds.push(entry);
    if (!feed.enabled) {
      entry.status = 'off';
      continue;
    }
    if (!feed.termsChecked) {
      entry.status = 'terms-unchecked';
      continue;
    }
    const problem = feedUrlProblem(feed.url);
    if (problem) {
      entry.status = 'blocked';
      entry.reason = problem;
      continue;
    }
    const robots = await robotsCheck(feed.url, fetchImpl);
    if (!robots.ok) {
      entry.status = 'robots';
      entry.reason = robots.reason;
      continue;
    }
    let xml;
    try {
      const response = await fetchImpl(feed.url, { headers: { 'User-Agent': FEED_USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`응답 ${response.status}`);
      xml = await response.text();
    } catch (error) {
      entry.status = 'fetch-failed';
      entry.reason = error instanceof Error ? error.message : String(error);
      continue;
    }
    const items = cleanItems(parseFeed(xml), { now, feed });
    entry.items = items.length;
    for (const item of items) {
      const ref = db.doc(`newsItems/${item.id}`);
      const created = await ref.create({ ...item, publishedAt: Timestamp.fromMillis(item.publishedAt), fetchedAt: FieldValue.serverTimestamp() }).then(
        () => true,
        (error) => {
          if (error?.code === 6) return false; // 이미 있음(ALREADY_EXISTS)
          throw error;
        },
      );
      if (created) entry.added += 1;
    }
    report.added += entry.added;
  }

  const old = await db.collection('newsItems').where('publishedAt', '<', Timestamp.fromMillis(now - FEED_LIMITS.keepDays * DAY)).get();
  const writer = db.bulkWriter();
  for (const item of old.docs) writer.delete(item.ref);
  await writer.close();
  report.removed = old.size;

  const runsRef = db.doc('adminConfig/newsFeedRuns');
  const runs = (await runsRef.get()).get('runs') ?? [];
  await runsRef.set({ runs: [report, ...runs].slice(0, RUNS_KEPT), updatedAt: FieldValue.serverTimestamp() });
  return report;
}
