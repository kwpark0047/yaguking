import { RESULT_PRESENTATION, formatElapsed, resultLabel } from '@/lib/game/labels';
import type { AtBatLogEntryDto } from '@/types/api';

/**
 * 결과 화면의 타석 로그.
 *
 * 각 행을 펼치면 해설과 **출처**가 나온다 (08 문서 §5.2). 출처 표기는
 * 문항 신뢰의 핵심이므로 결과 화면에서 확인할 수 있어야 한다.
 *
 * `<details>`를 쓰므로 자바스크립트 없이도 펼쳐진다.
 */
export function AtBatLogDetailed({ entries }: { entries: AtBatLogEntryDto[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-ink-2">기록된 타석이 없습니다.</p>;
  }

  return (
    <section aria-labelledby="at-bat-log-heading" className="flex flex-col gap-2">
      <h2 id="at-bat-log-heading" className="text-sm font-semibold">
        타석 로그
      </h2>

      <ol className="flex flex-col gap-1">
        {entries.map((entry) => {
          const presentation = RESULT_PRESENTATION[entry.result];
          const tone =
            presentation.tone === 'hr'
              ? 'var(--hr)'
              : presentation.tone === 'out'
                ? 'var(--out)'
                : 'var(--on-base)';

          return (
            <li key={entry.sequence}>
              <details
                className="rounded-option border"
                style={{ borderColor: 'var(--line)' }}
              >
                <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                  <span className="num-tabular w-5 text-ink-2">{entry.sequence}</span>
                  <span aria-hidden="true" style={{ color: tone }}>
                    {presentation.icon}
                  </span>
                  <span className="w-20 font-medium" style={{ color: tone }}>
                    {resultLabel(entry.result, false)}
                  </span>
                  <span className="num-tabular w-14 text-xs text-ink-2">
                    {formatElapsed(entry.elapsedMs)}
                  </span>
                  <span className="flex-1 truncate text-xs text-ink-2">
                    {entry.category}
                  </span>
                </summary>

                <div className="flex flex-col gap-2 border-t px-3 py-3" style={{ borderColor: 'var(--line)' }}>
                  {entry.stem && (
                    <p className="text-sm break-keep">{entry.stem}</p>
                  )}

                  {entry.reveal && (
                    <>
                      <p className="text-sm" style={{ color: 'var(--on-base)' }}>
                        정답: {entry.reveal.correctOption.label}.{' '}
                        {entry.reveal.correctOption.text}
                      </p>
                      {entry.reveal.explanation && (
                        <p className="text-sm text-ink-2 break-keep">
                          {entry.reveal.explanation}
                        </p>
                      )}
                      {entry.reveal.sources.length > 0 && (
                        <p className="text-xs text-ink-2">
                          출처:{' '}
                          {entry.reveal.sources
                            .map((source) => `${source.name} (검증 ${source.verifiedAt})`)
                            .join(', ')}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
