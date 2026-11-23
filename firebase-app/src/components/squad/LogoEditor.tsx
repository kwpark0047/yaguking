import {
  colorsReadable,
  LOGO_COLORS,
  LOGO_FRAMES,
  LOGO_SYMBOLS,
  normalizeInitials,
  type SquadLogo as Logo,
} from '@/lib/squad/squad';
import { SquadLogo } from './SquadLogo';

/**
 * 팀 로고 만들기 — 틀 6·상징 12·주색 12·보조색(주색과 3:1 이상 대비인 것만)·이니셜(영문·숫자 1~3자 또는 한글 한 글자).
 * 고르는 즉시 미리 보기. 실제 구단 로고를 흉내 낼 수 없게 정해진 조각만 쓴다.
 */
export function LogoEditor({ value, onChange }: { value: Logo; onChange: (logo: Logo) => void }) {
  const set = (change: Partial<Logo>) => {
    const next = { ...value, ...change };
    // 주색을 바꿨는데 보조색이 안 보이면 읽히는 첫 색으로
    if (!colorsReadable(next.primary, next.secondary)) {
      next.secondary = LOGO_COLORS.find((color) => colorsReadable(next.primary, color.id))?.id ?? next.secondary;
    }
    onChange(next);
  };
  const chip = (selected: boolean) => ({
    borderColor: selected ? 'var(--accent)' : 'var(--line)',
    borderWidth: selected ? 3 : 1,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center">
        <SquadLogo logo={value} size={112} label="로고 미리 보기" />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">틀</legend>
        <div className="grid grid-cols-6 gap-1">
          {LOGO_FRAMES.map((frame) => (
            <button
              key={frame.id}
              type="button"
              aria-label={frame.name}
              aria-pressed={value.frame === frame.id}
              onClick={() => set({ frame: frame.id })}
              className="flex min-h-12 items-center justify-center rounded-option border"
              style={chip(value.frame === frame.id)}
            >
              <SquadLogo logo={{ ...value, frame: frame.id, initials: '' }} size={36} />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">상징</legend>
        <div className="grid grid-cols-6 gap-1">
          {LOGO_SYMBOLS.map((symbol) => (
            <button
              key={symbol.id}
              type="button"
              aria-label={symbol.name}
              aria-pressed={value.symbol === symbol.id}
              onClick={() => set({ symbol: symbol.id })}
              className="flex min-h-12 items-center justify-center rounded-option border"
              style={chip(value.symbol === symbol.id)}
            >
              <SquadLogo logo={{ ...value, frame: 'circle', symbol: symbol.id, initials: '' }} size={36} />
            </button>
          ))}
        </div>
      </fieldset>

      {(['primary', 'secondary'] as const).map((slot) => (
        <fieldset key={slot} className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">{slot === 'primary' ? '주색(바탕)' : '보조색(테두리·글자)'}</legend>
          <div className="grid grid-cols-6 gap-1">
            {LOGO_COLORS.filter((color) => slot === 'primary' || colorsReadable(value.primary, color.id)).map((color) => (
              <button
                key={color.id}
                type="button"
                aria-label={color.name}
                aria-pressed={value[slot] === color.id}
                onClick={() => set({ [slot]: color.id })}
                className="min-h-11 rounded-option border"
                style={{ ...chip(value[slot] === color.id), backgroundColor: color.hex }}
              />
            ))}
          </div>
        </fieldset>
      ))}

      <label className="flex flex-col gap-1 text-sm font-semibold">
        글자(영문·숫자 1~3자 또는 한글 한 글자)
        <input
          value={value.initials}
          onChange={(event) => onChange({ ...value, initials: normalizeInitials(event.target.value).slice(0, 3) })}
          maxLength={3}
          autoCapitalize="characters"
          className="min-h-12 rounded-option border px-3 text-lg tracking-widest"
          style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
        />
      </label>
    </div>
  );
}
