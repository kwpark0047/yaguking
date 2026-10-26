import { describe, expect, it } from 'vitest';
import { buildBoxScore, formatRate } from '@/lib/engine/boxScore';
import type { AtBatEntry } from '@/lib/engine/types';

const entry = (result: AtBatEntry['result'], rbi = 0): AtBatEntry => ({ result, rbi });

describe('buildBoxScore — 집계', () => {
  it('빈 경기', () => {
    const box = buildBoxScore([]);
    expect(box).toMatchObject({ pa: 0, ab: 0, h: 0, r: 0 });
    expect(box.avg).toBeNull();
    expect(box.obp).toBeNull();
    expect(box.ops).toBeNull();
  });

  it('볼넷은 타석에 포함되지만 타수에서 제외된다', () => {
    const box = buildBoxScore([entry('BB'), entry('K')]);
    expect(box.pa).toBe(2);
    expect(box.ab).toBe(1);
    expect(box.bb).toBe(1);
    expect(box.so).toBe(1);
  });

  it('안타 종류별로 분리 집계한다', () => {
    const box = buildBoxScore([
      entry('1B'),
      entry('2B'),
      entry('3B'),
      entry('HR'),
      entry('K'),
    ]);
    expect(box.h).toBe(4);
    expect(box.singles).toBe(1);
    expect(box.d2).toBe(1);
    expect(box.d3).toBe(1);
    expect(box.hr).toBe(1);
    expect(box.ab).toBe(5);
  });

  it('누진타수(TB)를 계산한다', () => {
    const box = buildBoxScore([entry('1B'), entry('2B'), entry('3B'), entry('HR')]);
    expect(box.tb).toBe(1 + 2 + 3 + 4);
  });

  it('타점 합계가 득점이 된다', () => {
    const box = buildBoxScore([entry('HR', 2), entry('1B', 1), entry('K', 0)]);
    expect(box.r).toBe(3);
  });
});

describe('buildBoxScore — 비율 지표', () => {
  it('타율 = 안타 / 타수', () => {
    // 4타수 1안타
    const box = buildBoxScore([entry('1B'), entry('K'), entry('K'), entry('K')]);
    expect(box.avg).toBe(0.25);
  });

  it('출루율은 볼넷을 포함하고 타석을 분모로 쓴다', () => {
    // 2타석 1볼넷 1삼진 → OBP = (0+1)/2 = .500, AVG = 0/1 = .000
    const box = buildBoxScore([entry('BB'), entry('K')]);
    expect(box.avg).toBe(0);
    expect(box.obp).toBe(0.5);
  });

  it('장타율 = 누진타수 / 타수', () => {
    // 2타수 1홈런 1삼진 → SLG = 4/2 = 2.000
    const box = buildBoxScore([entry('HR'), entry('K')]);
    expect(box.slg).toBe(2);
  });

  it('OPS = 출루율 + 장타율', () => {
    const box = buildBoxScore([entry('HR'), entry('K')]);
    // OBP = 1/2 = .500, SLG = 2.000
    expect(box.ops).toBe(2.5);
  });

  it('소수 3자리로 반올림한다 (SQL 뷰와 동일)', () => {
    // 3타수 1안타 → .3333... → .333
    const box = buildBoxScore([entry('1B'), entry('K'), entry('K')]);
    expect(box.avg).toBe(0.333);
  });

  it('타수가 0이면 타율·장타율은 null, 출루율은 계산된다', () => {
    const box = buildBoxScore([entry('BB')]);
    expect(box.ab).toBe(0);
    expect(box.avg).toBeNull();
    expect(box.slg).toBeNull();
    expect(box.obp).toBe(1);
    expect(box.ops).toBeNull();
  });

  it('08 문서 §6.5 예시 박스스코어를 재현한다', () => {
    // 7타석 6타수 3안타(2루타1·홈런1·단타1) 1볼넷 3삼진
    const box = buildBoxScore([
      entry('2B'),
      entry('K'),
      entry('1B'),
      entry('BB'),
      entry('HR', 2),
      entry('K'),
      entry('K'),
    ]);
    expect(box.pa).toBe(7);
    expect(box.ab).toBe(6);
    expect(box.h).toBe(3);
    expect(box.hr).toBe(1);
    expect(box.bb).toBe(1);
    expect(box.so).toBe(3);
    expect(box.avg).toBe(0.5);
    // OBP = (3+1)/7 = .571, SLG = (1+2+4)/6 = 1.167 → OPS = 1.738
    expect(box.obp).toBe(0.571);
    expect(box.slg).toBe(1.167);
    expect(box.ops).toBe(1.738);
  });
});

describe('formatRate — 야구 표기', () => {
  it('1 미만은 앞의 0을 떼고 3자리로', () => {
    expect(formatRate(0.327)).toBe('.327');
    expect(formatRate(0.5)).toBe('.500');
    expect(formatRate(0)).toBe('.000');
  });

  it('1 이상은 정수부를 남긴다', () => {
    expect(formatRate(1.25)).toBe('1.250');
    expect(formatRate(2)).toBe('2.000');
  });

  it('null은 하이픈', () => {
    expect(formatRate(null)).toBe('-');
  });
});
