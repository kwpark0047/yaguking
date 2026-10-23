'use client';

import { useEffect, useState } from 'react';

/**
 * 타이머.
 *
 * 숫자 + 진행 바를 함께 쓴다. **`aria-live`를 쓰지 않는다** — 1초마다 읽히면
 * 스크린리더로 문제를 들을 수 없다. 10·5·3초 남음만 따로 고지한다
 * (08 문서 §8.2).
 *
 * 렌더 중에는 `Date.now()`를 쓰지 않는다. 서버와 클라이언트가 다른 값을
 * 계산해 하이드레이션이 깨지기 때문이다. 마운트 전에는 가득 찬 상태로
 * 그리고, 실제 잔여 시간은 마운트 후 effect에서 계산한다.
 *
 * 화면 타이머는 표시용이며 최종 판정은 서버가 한다 (08 문서 §2.4).
 */
export function Countdown({
  deadlineAtMs,
  totalMs,
  paused,
}: {
  /** 마운트 전에는 null. 클라이언트에서만 확정된다. */
  deadlineAtMs: number | null;
  totalMs: number;
  paused: boolean;
}) {
  const [remaining, setRemaining] = useState(totalMs);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (deadlineAtMs === null) return;
    if (paused) {
      setRemaining(Math.max(0, deadlineAtMs - Date.now()));
      return;
    }

    let announced = Number.POSITIVE_INFINITY;
    const tick = () => {
      const next = Math.max(0, deadlineAtMs - Date.now());
      setRemaining(next);

      const seconds = Math.ceil(next / 1000);
      for (const threshold of [10, 5, 3]) {
        if (seconds === threshold && announced !== threshold) {
          announced = threshold;
          setAnnouncement(`${threshold}초 남음`);
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [deadlineAtMs, paused]);

  const seconds = (remaining / 1000).toFixed(1);
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remaining / totalMs)) : 0;
  const urgent = remaining <= 3000;

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--line)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.round(totalMs / 1000)}
        aria-valuenow={Math.round(remaining / 1000)}
        aria-label="남은 시간"
      >
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-linear motion-reduce:transition-none"
          style={{
            width: `${ratio * 100}%`,
            backgroundColor: urgent ? 'var(--out)' : 'var(--accent)',
          }}
        />
      </div>
      <span
        className="num-tabular w-14 shrink-0 text-right text-sm font-semibold"
        style={{ color: urgent ? 'var(--out)' : 'var(--ink-1)' }}
      >
        {seconds}초
      </span>

      {/* 임계값에서만 말한다 */}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
