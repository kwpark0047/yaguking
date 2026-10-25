'use client';

import { useState } from 'react';
import { applyDocumentStyle, STYLE_OPTIONS, type StylePreference } from '@/lib/theme/style';

/**
 * 화면 스타일 고르기 (설정).
 *
 * 고르는 순간 화면 전체가 바뀐다 — 그게 가장 정확한 미리보기다.
 * 라디오 그룹이라 화살표 키로 옮겨 다닐 수 있고, 바뀐 결과를 화면 낭독기에
 * 알린다. 선택 상태는 테두리 색만이 아니라 라디오 표시와 굵기로도 드러난다.
 */
export function StylePicker({ initial }: { initial: StylePreference }) {
  const [value, setValue] = useState<StylePreference>(initial);
  const [announcement, setAnnouncement] = useState('');

  function choose(next: StylePreference) {
    setValue(next);
    applyDocumentStyle(next);
    const label = STYLE_OPTIONS.find((option) => option.value === next)?.label ?? '';
    setAnnouncement(`화면 스타일을 ${label}(으)로 바꿨습니다.`);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">화면 스타일</legend>
      <p className="text-xs text-ink-2 break-keep">
        이 기기에만 저장되며 계정이나 서버에는 남지 않습니다.
      </p>

      {STYLE_OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <label
            key={option.value}
            className="flex min-h-14 cursor-pointer items-start gap-3 rounded-option border px-3 py-3"
            style={{
              borderColor: selected ? 'var(--accent)' : 'var(--line)',
              borderWidth: selected ? 2 : 1,
              backgroundColor: 'var(--bg-card)',
            }}
          >
            <input
              type="radio"
              name="style-preference"
              value={option.value}
              checked={selected}
              onChange={() => choose(option.value)}
              className="mt-0.5 h-5 w-5 shrink-0"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="flex flex-col gap-0.5">
              <span className={selected ? 'text-sm font-semibold' : 'text-sm'}>
                {option.label}
              </span>
              <span className="text-xs text-ink-2 break-keep">{option.description}</span>
            </span>
          </label>
        );
      })}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </fieldset>
  );
}
