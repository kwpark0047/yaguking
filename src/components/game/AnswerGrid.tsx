'use client';

import type { OptionDto } from '@/types/api';

/**
 * 보기 그리드.
 *
 * - sm/lg: 2×2. md 가로모드: 1×4 (시선 이동을 줄인다 — 08 문서 §6.3)
 * - 주 버튼 최소 56px, 보기 간 8px 간격으로 오탭을 막는다
 * - 키보드: 1~4 / A·S·D·F. 선택이 곧 제출이라 힌트를 노출한다
 * - 판정 후에는 정답을 강조하고 내가 고른 오답을 표시한다 (색 + 텍스트)
 */
export function AnswerGrid({
  options,
  disabled,
  chosenId,
  correctId,
  onSelect,
}: {
  options: OptionDto[];
  disabled: boolean;
  chosenId: string | null;
  correctId: string | null;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-2 md:max-lg:landscape:grid-cols-4"
      role="group"
      aria-label="보기"
    >
      {/*
       * 조작 안내는 그리드에 한 번만 둔다.
       * 버튼마다 넣으면 읽을 때마다 반복되고, 버튼의 보이는 텍스트와
       * 접근 가능한 이름이 어긋나 WCAG 2.5.3(Label in Name)을 위반한다.
       */}
      <p className="sr-only">
        보기를 선택하면 바로 제출됩니다. 숫자 키 1~4 또는 A·S·D·F로도 선택할 수
        있습니다.
      </p>

      {options.map((option) => {
        const isChosen = chosenId === option.id;
        const isCorrect = correctId === option.id;
        const revealed = correctId !== null;

        let borderColor = 'var(--line)';
        let background = 'var(--bg-card)';
        let badge: string | null = null;

        if (revealed && isCorrect) {
          borderColor = 'var(--on-base)';
          background = 'color-mix(in srgb, var(--on-base) 14%, var(--bg-card))';
          badge = '정답';
        } else if (revealed && isChosen) {
          borderColor = 'var(--out)';
          background = 'color-mix(in srgb, var(--out) 14%, var(--bg-card))';
          badge = '내 선택';
        } else if (isChosen) {
          borderColor = 'var(--accent)';
        }

        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(option.id)}
            className="flex min-h-14 items-start gap-2 rounded-option border p-3 text-left text-base transition-colors disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transition-none"
            style={{ borderColor, backgroundColor: background }}
          >
            {/*
             * aria-label로 이름을 덮어쓰지 않는다. 보이는 텍스트(보기 기호 +
             * 본문)가 그대로 접근 가능한 이름이 되어야 한다.
             */}
            <span
              className="num-tabular mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-bold"
              style={{ backgroundColor: 'var(--line)' }}
            >
              {option.label}
            </span>
            <span className="flex-1 break-keep">{option.text}</span>
            {badge && (
              <span
                className="shrink-0 text-xs font-semibold"
                style={{ color: isCorrect ? 'var(--on-base)' : 'var(--out)' }}
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
