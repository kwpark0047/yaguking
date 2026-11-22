import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { playOnPress } from '@/lib/sound/sound';

/**
 * 메인 "게임 시작" 단추(웹판·미니앱판 공통). 단추 둘레가 은은히 빛나고, 빛 한 줄이 지나가고, ▶가 앞으로 살짝 나간다(globals.css `.start-cta`).
 * 움직이는 것은 단추 안쪽 장식뿐이라 단추 자리·크기는 그대로다(누르기·화면 읽기에 영향 없음).
 * 누르면 방망이 소리와 응원 소리(소리 설정이 켜져 있을 때만 — 기본 끔). 화면 효과·동작 줄이기는 CSS가 따른다.
 */
export function StartButton({ style }: { style: CSSProperties }) {
  return (
    <Link
      to="/play"
      className="start-cta squishy font-cute flex min-h-16 items-center justify-center gap-2 text-2xl"
      style={style}
      onClick={() => playOnPress('playBall')}
    >
      <span className="start-cta__shine" aria-hidden="true" />
      게임 시작{' '}
      <span className="start-cta__icon" aria-hidden="true">
        ▶
      </span>
    </Link>
  );
}
