import { useEffect, useRef, useState } from 'react';
import { describeBases } from '@/lib/engine';
import { BaseDiamond } from './BaseDiamond';

/** 스코어보드에 보이는 값(기존 앱 ScoreboardDto와 같은 모양) */
export interface ScoreboardDto {
  inning: number;
  outs: number;
  /** 비트마스크: 1 = 1루, 2 = 2루, 4 = 3루 */
  bases: number;
  runs: number;
  streak: number;
}

/**
 * 스코어보드.
 *
 * 변화는 `aria-live="polite"`로 고지한다 — "아웃 2, 주자 2루, 득점 3"
 * (08 문서 §8.2). 숫자는 tabular로 고정해 자릿수가 흔들리지 않게 한다.
 *
 * 360px에서는 2행(이닝·아웃·득점 / 다이아몬드·연속)으로 접는다. 한 줄에
 * 모두 넣으면 라벨이 세로로 쪼개진다 (08 문서 §6.2 와이어프레임).
 */
export function ScoreBoard({
  scoreboard,
  inningsTarget,
}: {
  scoreboard: ScoreboardDto;
  inningsTarget: number;
}) {
  const { inning, outs, runs, streak, bases } = scoreboard;
  // 새로 켜진 아웃 등만 한 번 살짝 커진다(docs/motion-plan.md §4) — 다시 그리려고 key를 바꾼다
  const previousOuts = useRef(outs);
  const [pulse, setPulse] = useState<{ index: number; key: number } | null>(null);
  useEffect(() => {
    if (outs > previousOuts.current) setPulse((value) => ({ index: outs - 1, key: (value?.key ?? 0) + 1 }));
    previousOuts.current = outs;
  }, [outs]);
  const announcement = `${inning}회, 아웃 ${outs}, ${describeBases(bases)}, 득점 ${runs}`;

  return (
    <div className="flex flex-col gap-1 bg-bg-field px-4 py-2 md:flex-row md:items-center md:justify-between md:gap-4">
      {/* 스크린리더용 상태 고지. 타이머는 여기에 넣지 않는다. */}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="flex items-center justify-between gap-3 md:justify-start">
        <span className="num-tabular text-sm font-semibold whitespace-nowrap">
          {inning}회
          <span className="ml-1 text-xs font-normal text-ink-2">/ {inningsTarget}</span>
        </span>

        <span className="flex items-center gap-1.5 whitespace-nowrap text-sm">
          <span className="text-ink-2">아웃</span>
          <span className="inline-flex items-center gap-1" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={pulse?.index === i ? `${i}-${pulse.key}` : i}
                className={`inline-block size-2.5 rounded-full border${pulse?.index === i ? ' fx-pulse' : ''}`}
                style={{
                  borderColor: i < outs ? 'var(--out)' : 'var(--ink-2)',
                  backgroundColor: i < outs ? 'var(--out)' : 'transparent',
                }}
              />
            ))}
          </span>
        </span>

        <span className="num-tabular whitespace-nowrap text-sm">
          <span className="text-ink-2">득점</span>{' '}
          <span className="text-lg font-bold">{runs}</span>
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <BaseDiamond bases={bases} size={64} />

        {streak >= 3 && (
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {streak}연속 정답
          </span>
        )}
      </div>
    </div>
  );
}
