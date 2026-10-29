/**
 * 최신 소식(야구왕 서비스 소식) — 운영자 PC 매일 작업(ops/run-cleanup.cmd → admin-cli news). docs/news.md
 *
 * 관리자 사이트 "소식"에서 쓴 글(adminConfig/news.posts)을 **글마다 다시 확인**하고, 통과한 글만 이용자 앱이 읽는
 * 공개 문서(public/news)에 올린다. 기기는 public/news를 쓸 수 없다(규칙 — public은 관리자가 home만 쓴다).
 *
 * 확인: 칸 모양(제목·요약·본문 길이, 분류), **날짜**(달력에 있는 날·오늘 이하 — 미래 날짜는 예약, 1년 지난 글은 내림),
 * **출처**(https 주소가 실제로 열리는지 — 2xx·3xx). 결과는 adminConfig/news.checks에 남겨 관리자 화면이 보여 준다.
 * 자동 수집은 하지 않는다 — 글은 사람이 쓴다(리그 경기 소식은 데이터 이용 허락 전까지 없음).
 *
 * 화면 쪽 검사(src/lib/news/validate.ts)와 같아야 한다(tests/unit/news.test.ts가 대조).
 */
import { FieldValue } from 'firebase-admin/firestore';

export const NEWS_CATEGORIES = ['업데이트', '안내', '이벤트'];
export const NEWS_LIMITS = { title: 80, summary: 200, body: 3000, sourceName: 60, posts: 50 };
export const NEWS_PUBLIC_MAX = 30;
export const NEWS_ARCHIVE_DAYS = 365;

const KST = 9 * 3_600_000;
const DAY = 86_400_000;
export const kstToday = (ms) => new Date(ms + KST).toISOString().slice(0, 10);

/** 달력에 있는 날짜인가(2026-02-30 같은 것은 아님) */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** 칸 모양 문제(없으면 null) — validate.ts newsProblem과 같다 */
export function newsProblem(post) {
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  if (!text(post.title) || text(post.title).length > NEWS_LIMITS.title) return `제목은 1~${NEWS_LIMITS.title}자`;
  if (!NEWS_CATEGORIES.includes(post.category)) return '분류를 골라 주세요';
  if (!isCalendarDate(post.date)) return '날짜가 올바르지 않아요';
  if (!text(post.summary) || text(post.summary).length > NEWS_LIMITS.summary) return `요약은 1~${NEWS_LIMITS.summary}자`;
  if (!text(post.body) || text(post.body).length > NEWS_LIMITS.body) return `본문은 1~${NEWS_LIMITS.body}자`;
  if (!text(post.sourceName) || text(post.sourceName).length > NEWS_LIMITS.sourceName) return `출처 이름은 1~${NEWS_LIMITS.sourceName}자`;
  if (typeof post.sourceUrl !== 'string' || !/^https:\/\/[^\s]+$/.test(post.sourceUrl)) return '출처 주소는 https://로 시작해야 해요';
  return null;
}

/** 날짜 확인 — 'ok' | 'scheduled'(미래, 그날 올라감) | 'archived'(1년 지남) */
export function dateStatus(date, today) {
  if (date > today) return 'scheduled';
  if (Date.parse(today) - Date.parse(date) > NEWS_ARCHIVE_DAYS * DAY) return 'archived';
  return 'ok';
}

/** 출처 주소가 열리는가 — HEAD, 안 되면 GET. 10초 */
export async function sourceReachable(url, fetchImpl = fetch) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await fetchImpl(url, { method, redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': 'YaguKing-news-check/1.0' } });
      if (response.status >= 200 && response.status < 400) return { ok: true, status: response.status };
      if (method === 'GET') return { ok: false, status: response.status };
    } catch (error) {
      if (method === 'GET') return { ok: false, status: 0, error: String(error?.name ?? error) };
    }
  }
  return { ok: false, status: 0 };
}

const publicPost = (post) => ({
  id: post.id,
  title: post.title.trim(),
  date: post.date,
  category: post.category,
  summary: post.summary.trim(),
  body: post.body.trim(),
  sourceName: post.sourceName.trim(),
  sourceUrl: post.sourceUrl,
});

/** 처음 글 넣기 — 글이 하나도 없을 때만(관리자가 쓴 글은 건드리지 않는다). 모양이 틀린 글은 넣지 않는다 */
export async function seedNews({ db, posts }) {
  const ref = db.doc('adminConfig/news');
  const existing = (await ref.get()).get('posts') ?? [];
  if (existing.length > 0) return { seeded: 0, reason: '이미 글이 있음' };
  const valid = posts.filter((post) => typeof post?.id === 'string' && newsProblem(post) === null).slice(0, NEWS_LIMITS.posts);
  await ref.set({ posts: valid.map((post) => ({ ...post, hidden: post.hidden === true })), updatedAt: FieldValue.serverTimestamp(), by: 'ops-seed' }, { merge: true });
  return { seeded: valid.length, skipped: posts.length - valid.length };
}

/** 매일 실행: 글마다 확인 → 통과한 글만 public/news. `now`·`fetchImpl`은 테스트용 */
export async function runNews({ db, now = Date.now(), fetchImpl = fetch }) {
  const today = kstToday(now);
  const configRef = db.doc('adminConfig/news');
  const posts = ((await configRef.get()).get('posts') ?? []).slice(0, NEWS_LIMITS.posts);
  const checks = {};
  const visible = [];
  for (const post of posts) {
    if (typeof post?.id !== 'string') continue;
    const at = FieldValue.serverTimestamp();
    if (post.hidden === true) {
      checks[post.id] = { ok: false, reason: '숨김', at };
      continue;
    }
    const problem = newsProblem(post);
    if (problem) {
      checks[post.id] = { ok: false, reason: problem, at };
      continue;
    }
    const status = dateStatus(post.date, today);
    if (status !== 'ok') {
      checks[post.id] = { ok: false, reason: status === 'scheduled' ? `예약(${post.date}에 올라감)` : '1년 지나 내림', at };
      continue;
    }
    const source = await sourceReachable(post.sourceUrl, fetchImpl);
    if (!source.ok) {
      checks[post.id] = { ok: false, reason: `출처가 열리지 않음(${source.status || source.error || '응답 없음'})`, at };
      continue;
    }
    checks[post.id] = { ok: true, reason: '올림', at };
    visible.push(publicPost(post));
  }
  visible.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'ko'));
  const shown = visible.slice(0, NEWS_PUBLIC_MAX);
  await db.doc('public/news').set({ posts: shown, checkedDay: today, updatedAt: FieldValue.serverTimestamp() });
  // 확인 결과는 통째로 바꾼다(지운 글의 결과가 남지 않게). 설정 문서가 없으면(글이 하나도 없음) 남길 것도 없다
  if (posts.length > 0) await configRef.update({ checks, checkedAt: FieldValue.serverTimestamp() });
  return { posts: posts.length, shown: shown.length, failed: Object.values(checks).filter((check) => !check.ok).length };
}
