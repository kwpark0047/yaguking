import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { answerQuestion as answer, hasFirestore } from '../e2e/helpers';

/**
 * 앱인토스 미니앱판(docs/toss-miniapp.md) — 정책에 걸리는 것이 화면에 없고, 비회원으로 놀 수 있다.
 * 토스 앱 밖이라 SDK 호출은 웹 API로 넘어간다(실제 토스 앱 확인은 콘솔 QR 테스트).
 */
test.describe.configure({ mode: 'serial' });

test('메인: 게임·오늘의 1이닝·대결이 있고, 로그인·가입·광고·설치 권유·달력·출석·등수는 없다. 들어오자마자 뜨는 창도 없다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /게임 시작/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /오늘의 1이닝/ })).toBeVisible();
  await expect(page.getByRole('link', { name: '친구 대결' })).toBeVisible();
  for (const name of [/로그인/, /가입/, /출석/, /월간 등수/, /공식전/, /구글 캘린더/, /광고/]) await expect(page.getByRole('link', { name })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '매일 알림 받기' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
  expect(await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations())?.length ?? 0)).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['critical', 'serious'].includes(v.impact ?? ''))).toEqual([]);
});

test('기기가 어두운 모드여도 밝은 화면(앱인토스는 다크 모드 미지원), 가로 넘침 없음', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const background = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim());
  expect(background).toBe('#f6f3ec');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('화면 틀이 그대로다 — 게임 시작은 넓은 단추, 화면 읽기 전용 글자는 보이지 않고, 보기 4개가 세로로', async ({ page }) => {
  await page.goto('/');
  const start = await page.getByRole('link', { name: /게임 시작/ }).boundingBox();
  expect(start!.width).toBeGreaterThan(280);
  expect(start!.height).toBeGreaterThanOrEqual(64);
  const emblem = await page.getByAltText('야구왕').boundingBox();
  expect(emblem!.height).toBeLessThanOrEqual(150);
  await page.goto('/daily');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  const size = await page.getByText('글자 크기:', { exact: false }).first().boundingBox();
  expect(size!.width).toBeLessThanOrEqual(2); // sr-only
  const options = page.getByRole('group', { name: '보기' }).getByRole('button');
  const [first, second] = [await options.nth(0).boundingBox(), await options.nth(1).boundingBox()];
  expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1);
  await page.evaluate(() => localStorage.removeItem('yk_daily'));
});

test('회원 화면 주소는 메인으로 돌아온다', async ({ page }) => {
  for (const path of ['/auth?mode=signup', '/settings', '/ranking', '/official', '/level-test', '/welcome/age']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('link', { name: /게임 시작/ })).toBeVisible();
  }
});

test('외부 링크는 눌러도 나가지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = 'https://example.com/';
    link.id = 'outside';
    link.textContent = 'outside';
    document.body.append(link);
  });
  await page.locator('#outside').click();
  await expect(page).toHaveURL(/localhost:5176/);
});

test('오늘의 1이닝: 로그인 없이 3문제, 결과 줄에 토스 링크(intoss://)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/daily');
  for (const index of [0, 1, 2]) {
    await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
    await answer(page, index !== 1);
    await page.getByRole('button', { name: index < 2 ? '다음 문제' : '결과 보기' }).click();
  }
  await expect(page.getByRole('heading', { name: '오늘의 1이닝 끝!' })).toBeVisible();
  await expect(page.getByLabel('공유할 글')).toContainText('intoss://yaguking/daily');
});

test('개인 경기: 비회원으로 바로 시작하고, 3아웃이면 끝, 가입 링크는 보이지 않는다', async ({ page }) => {
  test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
  test.setTimeout(60_000);
  await page.goto('/');
  await page.getByRole('link', { name: /게임 시작/ }).click();
  for (let out = 0; out < 3; out += 1) {
    await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
    await answer(page, false);
    await page.getByRole('button', { name: out < 2 ? '다음 타석' : '결과 보기' }).click();
  }
  await expect(page.getByRole('heading', { name: /경기 종료/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('a[href^="/auth"]:visible')).toHaveCount(0);
});

test('하루 3판을 다 쓰면 가입 안내 대신 오늘의 1이닝으로', async ({ page }) => {
  test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
  test.setTimeout(150_000);
  await page.goto('/play');
  for (let game = 0; game < 3; game += 1) {
    for (let out = 0; out < 3; out += 1) {
      await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
      await answer(page, false);
      await page.getByRole('button', { name: out < 2 ? '다음 타석' : '결과 보기' }).click();
    }
    await expect(page.getByRole('heading', { name: /경기 종료/ })).toBeVisible({ timeout: 15_000 });
    if (game < 2) await page.getByRole('button', { name: '한 판 더' }).click();
  }
  await page.goto('/play');
  await expect(page.getByRole('heading', { name: '오늘 경기를 다 했어요' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('가입', { exact: false })).toHaveCount(0);
  await page.getByRole('link', { name: '오늘의 1이닝' }).click();
  await expect(page).toHaveURL(/\/daily$/);
});

test('친구 대결 방: 링크 복사는 토스 링크', async ({ page, context }) => {
  test.skip(!hasFirestore, 'Firestore 에뮬레이터(JDK 21)가 필요합니다.');
  test.setTimeout(60_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/room');
  await page.getByLabel(/이름|닉네임/).first().fill('토스선수');
  await page.getByRole('button', { name: /방 만들기/ }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}$/, { timeout: 15_000 });
  const code = page.url().split('/').pop();
  await page.getByRole('button', { name: /링크 복사|복사/ }).first().click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 10_000 }).toBe(`intoss://yaguking/room/${code}`);
});
