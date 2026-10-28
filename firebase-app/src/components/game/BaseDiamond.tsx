import { describeBases } from '@/lib/engine';

/**
 * 주자 다이아몬드.
 *
 * 색만으로 구분하지 않는다 — 주자 있음은 **채운 도형**, 없음은 **빈 도형**이다.
 * 다이아몬드는 장식이 아니라 정보이므로 텍스트 요약을 함께 둔다 (08 문서 §8.2).
 */
export function BaseDiamond({ bases, size = 72 }: { bases: number; size?: number }) {
  const on = (bit: number) => (bases & bit) !== 0;
  const summary = describeBases(bases);

  // 베이스 중심 좌표를 내야 라인의 꼭짓점에 맞춘다.
  // 1루 (54,24) · 2루 (32,8) · 3루 (10,24) · 홈 (32,42)
  const spots = [
    { bit: 1, cx: 54, cy: 24, label: '1루' },
    { bit: 2, cx: 32, cy: 8, label: '2루' },
    { bit: 4, cx: 10, cy: 24, label: '3루' },
  ];

  return (
    <div className="flex items-center gap-2">
      <svg
        width={size}
        height={size * 0.75}
        viewBox="0 0 64 48"
        role="img"
        aria-label={summary}
        className="shrink-0"
      >
        {/* 내야 라인 */}
        <path
          d="M32 42 L10 24 L32 8 L54 24 Z"
          fill="none"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        {spots.map((spot) => (
          <rect
            key={spot.bit}
            className="base-spot"
            x={spot.cx - 4}
            y={spot.cy - 4}
            width="8"
            height="8"
            transform={`rotate(45 ${spot.cx} ${spot.cy})`}
            fill={on(spot.bit) ? 'var(--on-base)' : 'none'}
            stroke={on(spot.bit) ? 'var(--on-base)' : 'var(--ink-2)'}
            strokeWidth="1.5"
          />
        ))}
        {/* 홈 플레이트 */}
        <rect x={28} y={38} width="8" height="8" fill="var(--ink-2)" opacity="0.6" />
      </svg>
      <span className="text-xs text-ink-2">{summary}</span>
    </div>
  );
}
