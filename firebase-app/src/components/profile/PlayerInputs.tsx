import { MAX_FAVORITE_PLAYERS, PLAYER_NAME_MAX } from '@/lib/profile/validate';

/**
 * 최애 선수 TOP3 — **자유 입력**(선택). 선수 명단을 두지 않는다: 선수 기록·명단은
 * KBO 데이터라 이용 허락 전에는 수집·보관하지 않는다(13 문서, docs/data-model.md §2.2).
 */
export function PlayerInputs({
  values,
  onChange,
  disabled,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const slots = Array.from({ length: MAX_FAVORITE_PLAYERS }, (_, index) => values[index] ?? '');

  return (
    <div className="flex flex-col gap-2">
      {slots.map((value, index) => (
        <label key={index} className="flex items-center gap-3 text-sm">
          <span className="font-cute w-8 shrink-0 text-lg">{index + 1}위</span>
          <input
            value={value}
            disabled={disabled}
            maxLength={PLAYER_NAME_MAX + 5}
            placeholder={index === 0 ? '좋아하는 선수 이름' : '(선택)'}
            onChange={(event) => {
              const next = [...slots];
              next[index] = event.target.value;
              onChange(next);
            }}
            aria-label={`최애 선수 ${index + 1}위`}
            className="min-h-12 flex-1 rounded-option border px-3 text-base"
            style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
          />
        </label>
      ))}
    </div>
  );
}
