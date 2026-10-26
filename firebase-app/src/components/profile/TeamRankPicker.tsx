import { TEAMS } from '@/content/teams';
import { teamStyle, teamTheme } from '@/lib/theme/teams';
import { teamThemesEnabled } from '@/lib/theme/themeSwitch';
import { toggleTeam } from '@/lib/profile/validate';

/**
 * 최애 구단 TOP3 — **누른 순서가 순위**다. 다시 누르면 빠진다.
 *
 * 버튼마다 그 구단의 색을 입혀 고르기 전에 테마가 보인다. 색은 보조이고 구단명과
 * 순위 숫자가 글자로 붙는다. 순위는 `aria-pressed`와 버튼 이름("LG 트윈스, 1위")으로도
 * 알린다 — 색만으로 구분하지 않는다. 구단 로고는 쓰지 않는다.
 */
export function TeamRankPicker({
  ranked,
  onChange,
  disabled,
}: {
  ranked: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const themes = teamThemesEnabled();

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {TEAMS.map((team) => {
        const rank = ranked.indexOf(team.slug) + 1;
        const selected = rank > 0;
        const theme = teamTheme(themes ? team.slug : null);
        const full = !selected && ranked.length >= 3;

        return (
          <button
            key={team.slug}
            type="button"
            disabled={disabled || full}
            aria-pressed={selected}
            aria-label={selected ? `${team.name}, ${rank}위` : team.name}
            onClick={() => onChange(toggleTeam(ranked, team.slug))}
            data-team={theme.slug}
            style={{
              ...teamStyle(theme),
              borderColor: selected ? 'var(--accent)' : 'var(--line)',
              borderWidth: selected ? 2 : 1,
            }}
            className="team-band flex min-h-14 items-center justify-between gap-2 rounded-option border px-3 text-left text-sm disabled:opacity-50"
          >
            <span className="flex items-center gap-2">
              <span className="team-dot" aria-hidden="true" />
              <span className={selected ? 'font-semibold' : undefined}>{team.shortName}</span>
            </span>
            {selected && (
              <span
                aria-hidden="true"
                className="font-cute grid h-7 w-7 place-items-center rounded-full text-sm"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
              >
                {rank}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
