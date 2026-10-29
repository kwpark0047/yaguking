import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * 게임 화면 고급화 — 글자 크기 소·중·대, 테마(docs/game-look-plan.md).
 * 실제 글자 크기(px)와 보기 4개가 첫 화면에 들어오는지를 잰다. SCREENSHOT_DIR이 있으면 테마 × 크기 화면을 남긴다(운영자 확인용).
 */
test.describe.configure({ mode: 'serial' });

const px = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

async function openGame(page: Page) {
  await page.goto('/play');
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
}

test('기본은 중(1.5배)·나이트 골드, "가가" 단추로 대 → 소 → 중, 기기에 남는다', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('html')).toHaveAttribute('data-text', 'm');
  await expect(page.locator('html')).toHaveAttribute('data-style', 'gold');
  expect(await px(page, '#question-stem')).toBeCloseTo(25.5, 0);
  expect(await px(page, '.g-option')).toBeCloseTo(24, 0);

  const toggle = page.getByRole('button', { name: /글자 크기:/ });
  await expect(toggle).toHaveAccessibleName(/글자 크기: 중$/);
  await toggle.click();
  await expect(toggle).toHaveAccessibleName(/글자 크기: 대$/);
  expect(await px(page, '#question-stem')).toBeCloseTo(34, 0);
  expect(await page.evaluate(() => localStorage.getItem('yk_text'))).toBe('l');
  await toggle.click();
  expect(await px(page, '#question-stem')).toBeCloseTo(17, 0); // 소 = 예전 크기
  await toggle.click();
  expect(await page.evaluate(() => localStorage.getItem('yk_text'))).toBeNull(); // 기본이면 지움
  await page.reload();
  await expect(page.locator('#question-stem')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('html')).toHaveAttribute('data-text', 'm');
});

test('폰(360×740)에서 소·중은 보기 4개가 첫 화면에, 가로 넘침 없음 — 대는 문제 맨 위로 맞춘다', async ({ page }) => {
  test.skip(test.info().project.name !== 'sm-360', '폰 크기에서만');
  for (const size of ['s', 'm', 'l'] as const) {
    await page.addInitScript((value) => localStorage.setItem('yk_text', value), size);
    await openGame(page);
    const last = await page.getByRole('group', { name: '보기' }).getByRole('button').last().boundingBox();
    const viewport = page.viewportSize()!;
    if (size !== 'l') expect(last!.y + last!.height, `${size}: 마지막 보기가 화면 안`).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${size}: 가로 넘침`).toBe(true);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/size-${size}-360.png` });
  }
});

test('테마를 바꾸면 화면 색이 바뀌고(구단색 없이), 테마마다 접근성 검사 통과', async ({ page }) => {
  test.setTimeout(90_000);
  const colors = new Set<string>();
  for (const theme of ['gold', 'green', 'burgundy', 'stone', 'contrast'] as const) {
    await page.addInitScript((value) => localStorage.setItem('yk_theme', value), theme);
    await openGame(page);
    await expect(page.locator('html')).toHaveAttribute('data-style', theme);
    await expect(page.locator('html')).not.toHaveAttribute('data-team', /.+/);
    colors.add(await page.evaluate(() => getComputedStyle(document.body).backgroundColor + getComputedStyle(document.documentElement).getPropertyValue('--accent')));
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${theme} ${v.id}`)).toEqual([]);
    if (process.env.SCREENSHOT_DIR) {
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/theme-${theme}-${test.info().project.name}.png` });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/theme-${theme}-dark-${test.info().project.name}.png` });
      await page.emulateMedia({ colorScheme: 'light' });
    }
  }
  expect(colors.size).toBe(5);
});

test('메인에서 테마·글자 크기를 고를 수 있다', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('테마').selectOption('burgundy');
  await expect(page.locator('html')).toHaveAttribute('data-style', 'burgundy');
  await page.getByLabel('글자 크기').selectOption('l');
  await expect(page.locator('html')).toHaveAttribute('data-text', 'l');
  expect(await page.evaluate(() => [localStorage.getItem('yk_theme'), localStorage.getItem('yk_text')])).toEqual(['burgundy', 'l']);
});
