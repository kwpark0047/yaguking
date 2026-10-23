import { formatRate } from '@/lib/engine';
import type { BoxScore as BoxScoreType } from '@/lib/engine';

/**
 * 박스스코어 (08 문서 §5.2).
 *
 * **비회원에게도 전부 공개한다.** 결과를 인질로 가입을 요구하지 않는다.
 * 숫자는 tabular로 고정한다.
 */
export function BoxScore({ box, runs }: { box: BoxScoreType; runs: number }) {
  const counts: [string, number][] = [
    ['타석', box.pa],
    ['타수', box.ab],
    ['안타', box.h],
    ['2루타', box.d2],
    ['3루타', box.d3],
    ['홈런', box.hr],
    ['볼넷', box.bb],
    ['삼진', box.so],
  ];

  const rates: [string, string][] = [
    ['타율', formatRate(box.avg)],
    ['출루율', formatRate(box.obp)],
    ['장타율', formatRate(box.slg)],
    ['OPS', formatRate(box.ops)],
  ];

  return (
    <section
      className="rounded-card border p-4"
      style={{ borderColor: 'var(--line)' }}
      aria-labelledby="box-score-heading"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="box-score-heading" className="text-sm font-semibold">
          BOX SCORE
        </h2>
        <p className="num-tabular text-sm text-ink-2">
          최종 <span className="text-xl font-bold text-ink-1">{runs}</span>득점
        </p>
      </div>

      <dl className="grid grid-cols-4 gap-2 text-center">
        {counts.map(([label, value]) => (
          <div key={label} className="rounded-option bg-bg-field p-2">
            <dt className="text-xs text-ink-2">{label}</dt>
            <dd className="num-tabular font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
        {rates.map(([label, value]) => (
          <div key={label} className="rounded-option bg-bg-field p-2">
            <dt className="text-xs text-ink-2">{label}</dt>
            <dd className="num-tabular font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
