import { RESULT_PRESENTATION, formatElapsed, resultLabel } from '@/lib/game/labels';
import type { AtBatLogEntryDto } from '@/types/api';

/** 타석 로그 (중계 티커). md 좌측 열과 lg 우측 패널이 함께 쓴다. */
export function AtBatLog({ entries }: { entries: AtBatLogEntryDto[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-ink-2">첫 타석을 기다리고 있습니다.</p>;
  }

  return (
    <ol className="flex flex-col gap-1.5">
      {entries.map((entry) => {
        const presentation = RESULT_PRESENTATION[entry.result];
        const tone =
          presentation.tone === 'hr'
            ? 'var(--hr)'
            : presentation.tone === 'out'
              ? 'var(--out)'
              : 'var(--on-base)';

        return (
          <li
            key={entry.sequence}
            className="flex items-center gap-2 text-xs"
          >
            <span className="num-tabular w-5 text-ink-2">{entry.sequence}</span>
            <span aria-hidden="true" style={{ color: tone }}>
              {presentation.icon}
            </span>
            <span className="w-16 font-medium" style={{ color: tone }}>
              {resultLabel(entry.result, false)}
            </span>
            <span className="num-tabular w-14 text-ink-2">
              {formatElapsed(entry.elapsedMs)}
            </span>
            <span className="flex-1 truncate text-ink-2">{entry.category}</span>
          </li>
        );
      })}
    </ol>
  );
}
