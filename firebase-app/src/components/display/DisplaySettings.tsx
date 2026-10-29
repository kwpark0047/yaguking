import { useEffect, useId, useState } from 'react';
import {
  TEXT_CHOICES,
  THEME_CHOICES,
  nextTextSize,
  onDisplayChange,
  readTextSize,
  readTheme,
  saveTextSize,
  saveTheme,
  type TextSize,
  type ThemeChoice,
} from '@/lib/display/preference';

const selectStyle = { borderColor: 'var(--line)', backgroundColor: 'var(--hero-button-bg, var(--bg-card))', color: 'inherit' };
const label = (size: TextSize) => TEXT_CHOICES.find((choice) => choice.value === size)!.label;

function useTextSize(): TextSize {
  const [size, setSize] = useState<TextSize>(readTextSize);
  useEffect(() => onDisplayChange(() => setSize(readTextSize())), []);
  return size;
}

function useTheme(): ThemeChoice {
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  useEffect(() => onDisplayChange(() => setTheme(readTheme())), []);
  return theme;
}

/** 게임 화면 머리줄의 "가가" 단추 — 누를 때마다 소 → 중 → 대(docs/game-look-plan.md) */
export function TextSizeToggle() {
  const size = useTextSize();
  return (
    <button
      type="button"
      onClick={() => saveTextSize(nextTextSize(size))}
      title={`글자 크기 ${label(size)} — 눌러서 바꾸기(소·중·대)`}
      className="flex min-h-11 min-w-11 items-center justify-center gap-0.5 rounded-full border-2 px-2 font-semibold"
      style={{ borderColor: 'var(--line)' }}
    >
      {/* 보이는 글자("가가")가 화면 읽기 이름에도 들어가야 한다(WCAG 2.5.3) — 이름 = "가가 글자 크기: 중" */}
      <span className="text-xs">가</span>
      <span className="text-base">가</span>
      <span className="sr-only"> 글자 크기: {label(size)}</span>
    </button>
  );
}

export function TextSizeSetting({ compact = false }: { compact?: boolean }) {
  const size = useTextSize();
  const id = useId();
  return (
    <div className={compact ? 'flex items-center gap-2 text-xs' : 'flex flex-col gap-1 text-sm'}>
      <label htmlFor={id} className={compact ? 'text-ink-2' : undefined}>
        글자 크기
      </label>
      <select
        id={id}
        value={size}
        onChange={(event) => saveTextSize(event.target.value as TextSize)}
        className={compact ? 'min-h-11 rounded-option border px-2' : 'min-h-11 rounded-option border px-3'}
        style={selectStyle}
      >
        {TEXT_CHOICES.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      {!compact && <p className="text-xs text-ink-2 break-keep">게임 화면의 문제·보기·점수판 글자예요. 소는 예전 크기, 중은 1.5배(기본), 대는 2배예요.</p>}
    </div>
  );
}

export function ThemeSetting({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();
  const id = useId();
  const current = THEME_CHOICES.find((choice) => choice.value === theme)!;
  return (
    <div className={compact ? 'flex items-center gap-2 text-xs' : 'flex flex-col gap-1 text-sm'}>
      <label htmlFor={id} className={compact ? 'text-ink-2' : undefined}>
        테마
      </label>
      <select
        id={id}
        value={theme}
        onChange={(event) => saveTheme(event.target.value as ThemeChoice)}
        className={compact ? 'min-h-11 rounded-option border px-2' : 'min-h-11 rounded-option border px-3'}
        style={selectStyle}
      >
        {THEME_CHOICES.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      {!compact && <p className="text-xs text-ink-2 break-keep">{current.description}. 기기의 밝게·어둡게 설정을 따라요.</p>}
    </div>
  );
}
