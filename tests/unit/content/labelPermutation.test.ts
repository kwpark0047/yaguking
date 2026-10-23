import { describe, expect, it } from 'vitest';
// @ts-expect-error — 적재 스크립트는 JS다. 타입 선언 없이 함수만 가져다 쓴다.
import { labelPermutation } from '../../../scripts/seed-questions.mjs';

/**
 * 보기 라벨 섞기 (10 문서 §1.2.5).
 *
 * 이 테스트가 지키는 것은 **문항을 읽지 않고 한 글자만 찍어서는 맞힐 수 없다**는
 * 성질이다. 보정을 넣기 전 문제은행은 정답이 A에 53.5% 몰려 있어, 아무것도
 * 모르고 A만 찍어도 절반을 맞혔다. 속도가 타구 결과를 정하는 게임이라
 * 이 구멍은 기믹 자체를 무력화한다.
 */

const LABELS = ['A', 'B', 'C', 'D'];

/** 본문처럼 보이는 문자열을 많이 만든다. 실제 문항 분포를 흉내 낼 필요는 없다. */
function stems(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${i}번째 문항 본문은 무엇인가?`);
}

describe('labelPermutation', () => {
  it('항상 A~D 네 글자의 순열을 돌려준다', () => {
    for (const stem of stems(500)) {
      const labels = labelPermutation(stem);
      expect(labels).toHaveLength(4);
      expect([...labels].sort()).toEqual(LABELS);
    }
  });

  it('같은 본문이면 같은 순열이다', () => {
    // 재적재와 DB 재배치가 어긋나면 안 되므로 난수를 쓰지 않는다.
    for (const stem of stems(50)) {
      expect(labelPermutation(stem)).toEqual(labelPermutation(stem));
    }
  });

  it('본문이 다르면 순열도 갈린다', () => {
    const seen = new Set(stems(200).map((s) => labelPermutation(s).join('')));
    // 순열은 24가지뿐이다. 200개에서 과반은 나와야 한쪽으로 뭉치지 않은 것이다.
    expect(seen.size).toBeGreaterThan(12);
  });

  /**
   * 핵심. 작성자가 정답을 늘 첫 보기(option_a)에 두더라도, 화면에 붙는
   * 라벨은 네 글자에 고르게 퍼져야 한다.
   */
  it('정답을 늘 첫 보기에 둬도 라벨은 고르게 퍼진다', () => {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    const total = 2000;
    for (const stem of stems(total)) {
      const first = labelPermutation(stem)[0] as string;
      counts[first] = (counts[first] ?? 0) + 1;
    }

    for (const label of LABELS) {
      const share = counts[label]! / total;
      // 균등이면 25%. 표본 2000개의 1σ는 약 1%p이므로 넉넉히 잡아도 좁다.
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.3);
    }

    // 가장 많이 나온 라벨만 찍어도 얻는 이득이 크지 않아야 한다.
    const best = Math.max(...LABELS.map((l) => counts[l]!)) / total;
    expect(best).toBeLessThan(0.3);
  });
});
