import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runNews } from '../../ops/news.mjs';
import { clearEmulators, hasFirestore, PROJECT } from './helpers';

/**
 * 메인의 "이렇게 놀아요"·"최신 소식"(docs/news.md). 소식은 운영자 PC 확인 작업(ops/news.mjs)을 에뮬레이터에 직접 돌려 올린다 —
 * 출처 주소 확인은 가짜 fetch로(테스트가 바깥 사이트에 기대지 않게).
 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
test.describe.configure({ mode: 'serial' });

const db = getFirestore(initializeApp({ projectId: PROJECT }, 'e2e-news'));
const ok = (async () => new Response(null, { status: 200 })) as typeof fetch;
const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const post = (id: string, date: string, patch: object = {}) => ({
  id,
  title: `소식 ${id}`,
  date,
  category: '업데이트',
  summary: `${id} 요약`,
  body: `${id} 첫 문단\n\n${id} 둘째 문단`,
  sourceName: `출처 ${id}`,
  sourceUrl: `https://yaguking.web.app/${id}`,
  hidden: false,
  ...patch,
});

test.beforeAll(async () => {
  await clearEmulators();
});

test('메인: 이렇게 놀아요 세 단계, 소식이 없으면 최신 소식 구역이 없다', async ({ page }) => {
  await page.goto('/');
  const how = page.getByRole('region', { name: '이렇게 놀아요' });
  await expect(how.getByRole('listitem')).toHaveCount(3);
  await expect(how).toContainText('15초 안에');
  await expect(how).toContainText('3아웃이면 경기 끝');
  await expect(page.getByRole('region', { name: '최신 소식' })).toHaveCount(0);
});

test('확인을 통과한 소식만 메인(최근 3개)과 소식 화면에 — 출처·날짜와 함께, 예약·숨김 글은 안 보임', async ({ page }) => {
  await db.doc('adminConfig/news').set({
    posts: [
      post('a', '2026-10-20'),
      post('b', '2026-10-25'),
      post('c', '2026-10-27'),
      post('d', today),
      post('later', '2099-01-01'),
      post('secret', today, { hidden: true }),
    ],
  });
  expect(await runNews({ db, fetchImpl: ok })).toMatchObject({ shown: 4 });

  await page.goto('/');
  const news = page.getByRole('region', { name: '최신 소식' });
  await expect(news.getByRole('listitem')).toHaveCount(3);
  await expect(news.getByRole('listitem').first()).toContainText('소식 d');
  await expect(news).not.toContainText('소식 later');
  await news.getByRole('link', { name: '전체 보기' }).click();

  await expect(page.getByRole('heading', { name: '최신 소식', level: 1 })).toBeVisible();
  const list = page.getByRole('list', { name: '소식 목록' });
  await expect(list.getByRole('article')).toHaveCount(4);
  const first = list.getByRole('article', { name: '소식 d' });
  await expect(first).toContainText('d 둘째 문단');
  await expect(first.getByRole('link', { name: '출처 d' })).toHaveAttribute('href', 'https://yaguking.web.app/d');
  await expect(first.locator('time')).toHaveAttribute('datetime', today);
  await expect(list).not.toContainText('소식 secret');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
});
