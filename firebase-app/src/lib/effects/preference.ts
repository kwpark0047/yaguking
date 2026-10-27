/**
 * 화면 효과 설정(docs/effects-plan.md §6). 기기에만 저장한다(`yk_effects`, 처리방침 §10) — 서버 쓰기 없음.
 *
 * 실제로 쓰는 단계는 **설정과 기기 상태 중 더 조용한 쪽**:
 * - none: 효과 없음(결과는 글자·색으로만) — 설정 "끄기" 또는 기기의 동작 줄이기
 * - calm: 작은 CSS 효과와 반짝이만, 폭죽·꽃가루 없음 — 설정 "줄이기" 또는 고대비
 * - full: 모두
 */
export type EffectsChoice = 'on' | 'reduced' | 'off';
export type EffectsMode = 'full' | 'calm' | 'none';

export const EFFECTS_KEY = 'yk_effects';
export const EFFECTS_CHOICES: readonly { value: EffectsChoice; label: string }[] = [
  { value: 'on', label: '켜기' },
  { value: 'reduced', label: '줄이기' },
  { value: 'off', label: '끄기' },
];

export function resolveMode(choice: EffectsChoice, reducedMotion: boolean, highContrast: boolean): EffectsMode {
  if (choice === 'off' || reducedMotion) return 'none';
  if (choice === 'reduced' || highContrast) return 'calm';
  return 'full';
}

export function readChoice(): EffectsChoice {
  try {
    const saved = localStorage.getItem(EFFECTS_KEY);
    if (saved === 'reduced' || saved === 'off') return saved;
  } catch {
    // 저장소를 못 쓰면 기본값
  }
  return 'on';
}

export function saveChoice(choice: EffectsChoice): void {
  try {
    if (choice === 'on') localStorage.removeItem(EFFECTS_KEY);
    else localStorage.setItem(EFFECTS_KEY, choice);
  } catch {
    // 기억하지 못해도 이번 화면에는 적용된다
  }
  applyEffectsMode(choice);
}

function media(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

export function currentMode(choice: EffectsChoice = readChoice()): EffectsMode {
  const contrast =
    media('(prefers-contrast: more)') ||
    (typeof document !== 'undefined' && document.documentElement.dataset.style === 'contrast');
  return resolveMode(choice, media('(prefers-reduced-motion: reduce)'), contrast);
}

/** CSS가 효과를 켜고 끄도록 `<html data-effects>`에 적는다(앱 시작·설정 변경·기기 설정 변경 때) */
export function applyEffectsMode(choice: EffectsChoice = readChoice()): void {
  document.documentElement.dataset.effects = currentMode(choice);
}

export function watchEffectsMode(): void {
  applyEffectsMode();
  for (const query of ['(prefers-reduced-motion: reduce)', '(prefers-contrast: more)']) {
    window.matchMedia?.(query).addEventListener?.('change', () => applyEffectsMode());
  }
}
