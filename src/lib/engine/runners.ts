import type { AtBatResult, RunnerAdvance } from './types';

const FIRST = 1;
const SECOND = 2;
const THIRD = 4;

const pack = (b1: boolean, b2: boolean, b3: boolean): number =>
  (b1 ? FIRST : 0) | (b2 ? SECOND : 0) | (b3 ? THIRD : 0);

/** 루상 주자 수 */
export function runnerCount(bases: number): number {
  return (
    ((bases & FIRST) !== 0 ? 1 : 0) +
    ((bases & SECOND) !== 0 ? 1 : 0) +
    ((bases & THIRD) !== 0 ? 1 : 0)
  );
}

/**
 * 주자를 진루시키고 득점을 계산한다.
 *
 * 단타는 전 주자 1베이스, 2루타는 2베이스 진루로 단순화한다.
 * 볼넷은 강제 진루만 적용한다 (06 문서 §4.2).
 */
export function advanceRunners(bases: number, result: AtBatResult): RunnerAdvance {
  const b1 = (bases & FIRST) !== 0;
  const b2 = (bases & SECOND) !== 0;
  const b3 = (bases & THIRD) !== 0;

  switch (result) {
    case 'K':
      return { bases, runs: 0 };

    case 'BB': {
      if (!b1) return { bases: pack(true, b2, b3), runs: 0 };
      if (!b2) return { bases: pack(true, true, b3), runs: 0 };
      if (!b3) return { bases: pack(true, true, true), runs: 0 };
      // 만루 밀어내기
      return { bases: pack(true, true, true), runs: 1 };
    }

    case '1B':
      return { bases: pack(true, b1, b2), runs: b3 ? 1 : 0 };

    case '2B':
      return {
        bases: pack(false, true, b1),
        runs: (b2 ? 1 : 0) + (b3 ? 1 : 0),
      };

    case '3B':
      return {
        bases: pack(false, false, true),
        runs: runnerCount(bases),
      };

    case 'HR':
      return { bases: 0, runs: runnerCount(bases) + 1 };
  }
}

/**
 * 스크린리더·보조 텍스트용 주자 상태 설명 (08 문서 §8.2).
 * 다이아몬드는 장식이 아니라 정보이므로 텍스트 요약을 함께 제공한다.
 */
export function describeBases(bases: number): string {
  if (bases === 0) return '주자 없음';
  if (bases === (FIRST | SECOND | THIRD)) return '만루';

  const on: string[] = [];
  if ((bases & FIRST) !== 0) on.push('1');
  if ((bases & SECOND) !== 0) on.push('2');
  if ((bases & THIRD) !== 0) on.push('3');

  return `주자 ${on.join('·')}루`;
}
