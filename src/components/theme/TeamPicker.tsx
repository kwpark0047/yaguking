'use client';

import { teamStyle, teamTheme } from '@/lib/theme/teams';

export interface TeamOption {
  id: string;
  slug: string;
  name: string;
  shortName: string;
}

/**
 * 대표 구단 고르기 (온보딩 2단계, 설정).
 *
 * 버튼마다 **그 구단의** 색을 입혀, 고르기 전에 어떤 테마가 될지 보인다.
 * 색은 보조이고 구단명이 글자로 항상 붙는다. 선택 상태는 `aria-pressed`와
 * 굵은 테두리·체크 표시로 함께 알린다 — 색만으로 구분하지 않는다.
 *
 * `teamThemes`가 false면(서버의 `TEAM_THEMES=off`) 색 없이 중립으로 그린다.
 */
export function TeamPicker({
  teams,
  selectedId,
  disabled,
  teamThemes,
  onSelect,
}: {
  teams: TeamOption[];
  selectedId: string | null;
  disabled?: boolean;
  teamThemes: boolean;
  onSelect: (team: TeamOption) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
      {teams.map((team) => {
        const selected = selectedId === team.id;
        const theme = teamTheme(teamThemes ? team.slug : null);

        return (
          <button
            key={team.id}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onSelect(team)}
            data-team={theme.slug}
            style={{
              ...teamStyle(theme),
              borderColor: selected ? 'var(--accent)' : 'var(--line)',
              borderWidth: selected ? 2 : 1,
            }}
            className="team-band flex min-h-14 items-center justify-between gap-2 rounded-option border px-3 text-left text-sm disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <span className="team-dot" aria-hidden="true" />
              <span className={selected ? 'font-semibold' : undefined}>{team.shortName}</span>
            </span>
            {selected && (
              <span aria-hidden="true" style={{ color: 'var(--accent)' }}>
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
