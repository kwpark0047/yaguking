import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { WCAG_TAGS } from './helpers/env';

/**
 * 접근성 — 08 문서 §10의 11·12번, §8.
 *
 * critical·serious 위반 0을 기준으로 한다. moderate 이하는 보고만 하고
 * 실패시키지 않는다 — 자동 검사가 과잉 탐지하는 영역이기 때문이다.
 * 스크린리더 실사용 확인은 09 문서 §7.4의 수동 항목으로 남아 있다.
 */

const PAGES = ['/', '/auth', '/modes', '/rankings'];

for (const path of PAGES) {
  test(`${path}: axe critical/serious 위반 0`, async ({ page }) => {
    await page.goto(path);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    );

    const summary = blocking
      .map((violation) => `${violation.id} (${violation.nodes.length}곳): ${violation.help}`)
      .join('\n');

    expect(blocking, `${path}\n${summary}`).toEqual([]);
  });
}

test('문서 언어가 한국어로 선언된다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
});

test('확대를 막지 않는다', async ({ page }) => {
  await page.goto('/');
  const viewport = await page
    .locator('meta[name="viewport"]')
    .getAttribute('content');
  // maximum-scale / user-scalable=no 는 접근성 위반이다 (08 문서 §8.3).
  expect(viewport ?? '').not.toContain('maximum-scale');
  expect(viewport ?? '').not.toContain('user-scalable=no');
});

test('reduced-motion 에서 애니메이션이 사실상 제거된다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/modes');

  const durations = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .map((element) => getComputedStyle(element).transitionDuration)
      .filter((value) => value !== '0s')
      .map((value) => Number.parseFloat(value)),
  );

  for (const duration of durations) {
    expect(duration).toBeLessThanOrEqual(0.011);
  }
});

test('키보드만으로 주요 동작에 닿을 수 있다', async ({ page }) => {
  await page.goto('/modes');

  // 첫 포커스 가능한 요소까지 Tab으로 이동되는지만 본다.
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const element = document.activeElement;
    return element ? element.tagName : null;
  });

  expect(focused).not.toBeNull();
  expect(focused).not.toBe('BODY');
});
