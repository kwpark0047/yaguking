import { DIFFICULTY_LABEL } from '@/lib/game/labels';
import type { AtBatDto } from '@/types/api';

/**
 * 문제 카드.
 *
 * **기록 기준일을 반드시 표기한다** — 기준이 없으면 같은 문항의 정답이
 * 시간이 지나 바뀔 수 있다 (01 문서 §5).
 * 본문은 최소 17px, 말줄임 없이 줄바꿈한다 (08 문서 §2.2, §6.8).
 */
export function QuestionCard({ atBat }: { atBat: AtBatDto }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="question-stem">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
        <span>{atBat.category}</span>
        <span aria-hidden="true">·</span>
        <span>{DIFFICULTY_LABEL[atBat.difficulty]}</span>
        <span aria-hidden="true">·</span>
        <span>기준일 {atBat.recordAsOf}</span>
        {atBat.seasonScope && (
          <>
            <span aria-hidden="true">·</span>
            <span>{atBat.seasonScope}</span>
          </>
        )}
      </p>

      <h2
        id="question-stem"
        className="text-[17px] leading-[1.6] font-medium break-keep"
      >
        {atBat.stem}
      </h2>
    </section>
  );
}
