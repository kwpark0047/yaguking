import type { Page } from '@playwright/test';

/**
 * DB가 있어야만 돌아가는 시나리오를 가린다.
 *
 * 경기 진행(세션 생성 → 타석 제출 → 결과)은 전부 DB에 닿는다. Docker가 없는
 * 환경에서는 이 스펙들이 건너뛰어지고, 공개 화면·접근성·반응형만 돌아간다.
 */
export const hasDatabase = (): boolean => Boolean(process.env.DATABASE_URL);

/** 문서가 요구하는 접근성 기준 (08 문서 §8.3). */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * 가로 스크롤이 없어야 한다 (08 문서 §6.8).
 * 넘치는 요소를 함께 돌려주어 어디가 범인인지 바로 알 수 있게 한다.
 */
export async function measureOverflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const overflowing = [...document.querySelectorAll('*')]
      .filter((element) => element.getBoundingClientRect().right > root.clientWidth + 1)
      .slice(0, 5)
      .map((element) => `${element.tagName}.${String(element.className).slice(0, 40)}`);

    return {
      viewport: root.clientWidth,
      scrollWidth: root.scrollWidth,
      hasHorizontalScroll: root.scrollWidth > root.clientWidth,
      overflowing,
    };
  });
}

/**
 * 보기를 누를 수 있게 되거나 결과 화면으로 넘어갈 때까지 기다린다.
 *
 * 경기 종료 직후에는 결과 화면으로 이동하는 짧은 구간이 있어, 보기 버튼이
 * 아직 그려진 채 비활성 상태다. 둘 중 하나가 될 때까지 기다리지 않으면
 * 그 구간에서 엉뚱하게 실패한다.
 */
export async function waitForPlayable(
  page: Page,
  timeout = 15000,
): Promise<'playable' | 'result'> {
  await page.waitForFunction(
    () =>
      location.pathname.includes('/result') ||
      Boolean(
        document.querySelector(
          '[role="group"][aria-label="보기"] button:not([disabled])',
        ),
      ),
    undefined,
    { timeout },
  );
  return page.url().includes('/result') ? 'result' : 'playable';
}

/** 터치 타깃 최소 치수 (주 버튼 56px / 보조 44px). */
export async function measureTouchTargets(page: Page, selector: string) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: (element.textContent ?? '').trim().slice(0, 20),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      })
      .filter((entry) => entry.width > 0 && entry.height > 0);
  }, selector);
}
