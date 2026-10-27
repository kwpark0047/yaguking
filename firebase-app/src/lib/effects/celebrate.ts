import { planFor, type EffectEvent } from './catalog';
import { currentMode } from './preference';

/**
 * 화면이 부르는 입구: `celebrate({ kind: 'homeRun' })`.
 * 계획은 바로 세우고(가벼움), 캔버스 엔진은 처음 필요할 때 받는다. 효과는 결과 글자를 꾸밀 뿐 —
 * 화면 읽기는 각 화면의 role="status" 글자를 그대로 읽는다.
 */
let bigUsed = 0;

/** 새 판(또는 레벨 테스트)을 시작할 때 — 한 판 큰 효과 횟수를 다시 센다 */
export function resetGameEffects(): void {
  bigUsed = 0;
}

/** "rgb(247, 248, 250)" 같은 색이 밝은지(대략의 밝기 0.6 이상) */
export function isLight(color: string): boolean {
  const [r = 0, g = 0, b = 0] = (color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 >= 0.6;
}

function cssColor(element: Element, name: string, fallback: string): string {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value || fallback;
}

export function celebrate(event: EffectEvent, options: { origin?: Element | null } = {}): void {
  if (typeof window === 'undefined') return;
  const plan = planFor(event, currentMode(), bigUsed);
  if (plan.strength === 'big') bigUsed += 1;
  if (plan.steps.length === 0) return;

  const root = document.documentElement;
  const accent = cssColor(root, '--accent', '#ffc53d');
  const tier = options.origin ? cssColor(options.origin, '--tier', accent) : accent;
  // 밝은 바탕에서는 흰색·파스텔이 안 보인다 — 진한 색으로
  const light = isLight(getComputedStyle(document.body).backgroundColor);
  const colors = light
    ? {
        accent: [accent, '#e8a400', '#e53935', '#1e88e5', '#2e9d4f'],
        gold: ['#d99a00', '#b8860b', '#f2b400', '#8a6100'],
        tier: [tier, '#e8a400', '#e53935'],
      }
    : {
        accent: [accent, '#ffd166', '#ffffff', '#4fc3f7', '#ef5350'],
        gold: ['#ffc53d', '#ffe08a', '#fff4cc', '#d4a017'],
        tier: [tier, '#ffffff', '#ffd166'],
      };
  const rect = options.origin?.getBoundingClientRect();
  const area = rect && rect.width > 0 ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined;
  // 반짝이는 기준 요소 주변에, 폭죽·꽃가루는 화면 전체에
  const local = plan.steps.every((s) => s.part === 'sparkle') ? area : undefined;
  import('./engine')
    .then(({ play }) => play(plan.steps, colors, local))
    .catch(() => {
      // 엔진을 못 받으면(연결 끊김) 효과 없이 지나간다 — 결과 글자는 이미 보인다
    });
}
