/**
 * 화면 설정 — 글자 크기(소·중·대)와 테마색(docs/game-look-plan.md). **이 기기에만** 저장한다(`yk_text`·`yk_theme`, 처리방침 §10) —
 * 서버 읽기·쓰기 없음. 기본값이면 저장소에서 지운다(소리·효과 설정과 같은 방식).
 *
 * - 글자 크기: `<html data-text="s|m|l">` → CSS 변수 `--game-scale`(1 / 1.5 / 2) — 게임 화면의 문제·보기·시계·점수판·판정 글자만 곱한다
 * - 테마: `<html data-style>`에 테마 이름(globals.css·src/lib/theme/base.ts의 SURFACES). "구단"이면 data-style을 지우고
 *   최애 구단 테마(data-team)를 쓴다 — 구단 테마는 이 선택일 때만 켜진다(App.tsx TeamThemeSync)
 */
export type TextSize = 's' | 'm' | 'l';
export type ThemeChoice = 'gold' | 'green' | 'burgundy' | 'stone' | 'team' | 'contrast';

export const TEXT_KEY = 'yk_text';
export const THEME_KEY = 'yk_theme';
export const DEFAULT_TEXT: TextSize = 'm';
export const DEFAULT_THEME: ThemeChoice = 'gold';
export const TEXT_SCALE: Record<TextSize, number> = { s: 1, m: 1.5, l: 2 };

export const TEXT_CHOICES: readonly { value: TextSize; label: string }[] = [
  { value: 's', label: '소' },
  { value: 'm', label: '중' },
  { value: 'l', label: '대' },
];

export const THEME_CHOICES: readonly { value: ThemeChoice; label: string; description: string }[] = [
  { value: 'gold', label: '나이트 골드', description: '밤 야구장의 짙은 남색과 금색' },
  { value: 'green', label: '클래식 그린', description: '옛 야구장 잔디색과 황동색' },
  { value: 'burgundy', label: '버건디', description: '와인색 바탕과 샴페인 골드' },
  { value: 'stone', label: '화이트 스톤', description: '밝은 회백색과 짙은 남색' },
  { value: 'team', label: '내 구단', description: '최애 구단 1위의 색(회원)' },
  { value: 'contrast', label: '고대비', description: '글자 대비 7:1 이상, 또렷한 테두리' },
];

const TEXTS: readonly string[] = TEXT_CHOICES.map((choice) => choice.value);
const THEMES: readonly string[] = THEME_CHOICES.map((choice) => choice.value);

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string, fallback: string): void {
  try {
    if (value === fallback) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // 기억하지 못해도 이번 화면에는 적용된다
  }
}

export function readTextSize(): TextSize {
  const saved = read(TEXT_KEY);
  return saved && TEXTS.includes(saved) ? (saved as TextSize) : DEFAULT_TEXT;
}

export function readTheme(): ThemeChoice {
  const saved = read(THEME_KEY);
  return saved && THEMES.includes(saved) ? (saved as ThemeChoice) : DEFAULT_THEME;
}

/** 다음 크기(소 → 중 → 대 → 소) — 게임 화면의 "가가" 단추 */
export const nextTextSize = (size: TextSize): TextSize => (size === 's' ? 'm' : size === 'm' ? 'l' : 's');

const listeners = new Set<() => void>();
export function onDisplayChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `<html>`에 적는다 — 앱 시작·설정 변경 때 */
export function applyDisplay(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.text = readTextSize();
  const theme = readTheme();
  if (theme === 'team') delete root.dataset.style;
  else root.dataset.style = theme;
}

export function saveTextSize(size: TextSize): void {
  write(TEXT_KEY, size, DEFAULT_TEXT);
  applyDisplay();
  for (const listener of listeners) listener();
}

export function saveTheme(theme: ThemeChoice): void {
  write(THEME_KEY, theme, DEFAULT_THEME);
  applyDisplay();
  for (const listener of listeners) listener();
}

/** 앱 시작 때 한 번(main.tsx) — 화면이 그려지기 전에 칠해 깜빡임을 줄인다. 다른 탭에서 바꿔도 따라간다 */
export function watchDisplay(): void {
  applyDisplay();
  window.addEventListener('storage', (event) => {
    if (event.key !== TEXT_KEY && event.key !== THEME_KEY) return;
    applyDisplay();
    for (const listener of listeners) listener();
  });
}
