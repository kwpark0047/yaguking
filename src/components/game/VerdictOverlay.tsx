'use client';

import { RESULT_PRESENTATION, UPGRADE_LABEL, formatElapsed, resultLabel } from '@/lib/game/labels';
import type { SubmitAtBatDto } from '@/types/api';

/**
 * 판정 시트.
 *
 * - 배지 텍스트가 1차 정보, 색은 보조. 아이콘·텍스트를 병기한다
 * - 승급이 있었다면 **사유를 한 줄로** 밝힌다 (08 문서 §4.3)
 * - `해설 자세히`를 열면 자동 전환 타이머가 멈춘다 — 읽는 중에 넘어가지 않게
 * - 문제를 가리지 않는 하단 시트다 (08 문서 §6.2)
 */
export function VerdictOverlay({
  verdict,
  explanationOpen,
  onToggleExplanation,
  onNext,
  autoAdvanceMs,
}: {
  verdict: SubmitAtBatDto;
  explanationOpen: boolean;
  onToggleExplanation: () => void;
  onNext: () => void;
  autoAdvanceMs: number | null;
}) {
  const timedOut = verdict.outcome === 'deadline_exceeded';
  const presentation = RESULT_PRESENTATION[verdict.result];
  const label = resultLabel(verdict.result, timedOut);
  const tone =
    presentation.tone === 'hr'
      ? 'var(--hr)'
      : presentation.tone === 'out'
        ? 'var(--out)'
        : 'var(--on-base)';

  return (
    <section
      className="rounded-card border-t p-4"
      style={{ borderColor: tone, backgroundColor: 'var(--bg-card)' }}
      aria-labelledby="verdict-label"
    >
      {/* 판정은 role=status로 한 번 읽힌다 */}
      <div role="status" className="flex flex-col gap-2">
        <p id="verdict-label" className="flex items-center gap-2 text-xl font-bold">
          <span aria-hidden="true" style={{ color: tone }}>
            {presentation.icon}
          </span>
          <span style={{ color: tone }}>{label}</span>
          {verdict.rbi > 0 && (
            <span className="num-tabular text-sm font-semibold text-ink-2">
              {verdict.rbi}타점
            </span>
          )}
        </p>

        {verdict.upgraded && verdict.upgradeReason && (
          <p className="text-sm" style={{ color: 'var(--accent)' }}>
            {UPGRADE_LABEL[verdict.upgradeReason]}
          </p>
        )}

        {verdict.reveal && (
          <p className="text-sm text-ink-2">
            정답: {verdict.reveal.correctOption.label}. {verdict.reveal.correctOption.text}
          </p>
        )}

        <p className="num-tabular text-xs text-ink-2">
          응답 {formatElapsed(verdict.elapsedMs)}
          {timedOut && ' · 제한시간 초과로 서버가 아웃 처리했습니다'}
        </p>
      </div>

      {explanationOpen && verdict.reveal && (
        <div className="mt-3 flex flex-col gap-2 rounded-option bg-bg-base p-3">
          <p className="text-sm leading-relaxed break-keep">
            {verdict.reveal.explanation ?? '해설이 준비되지 않은 문항입니다.'}
          </p>
          {verdict.reveal.sources.length > 0 && (
            <p className="text-xs text-ink-2">
              출처:{' '}
              {verdict.reveal.sources
                .map((s) => `${s.name} (검증 ${s.verifiedAt})`)
                .join(', ')}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleExplanation}
          className="min-h-11 rounded-option border px-3 text-sm"
          style={{ borderColor: 'var(--line)' }}
          aria-expanded={explanationOpen}
        >
          {explanationOpen ? '해설 닫기' : '해설 자세히'}
        </button>

        <button
          type="button"
          onClick={onNext}
          className="min-h-11 rounded-option px-4 text-sm font-semibold"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          {verdict.finished ? '결과 보기' : '다음 타석'}
          {autoAdvanceMs !== null && (
            <span className="num-tabular ml-1 opacity-70" aria-hidden="true">
              {(autoAdvanceMs / 1000).toFixed(1)}s
            </span>
          )}
        </button>
      </div>

      {autoAdvanceMs === null && !verdict.finished && (
        <p className="mt-2 text-xs text-ink-2">
          해설을 보는 동안 자동 전환이 멈췄습니다. 준비되면 다음 타석을 누르세요.
        </p>
      )}
    </section>
  );
}
