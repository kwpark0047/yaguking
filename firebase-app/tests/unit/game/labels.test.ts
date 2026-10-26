import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_LABEL,
  MODE_LABEL,
  RESULT_PRESENTATION,
  UPGRADE_LABEL,
  formatElapsed,
  resultLabel,
} from '@/lib/game/labels';
import type { AtBatResult } from '@/lib/engine';

const ALL_RESULTS: AtBatResult[] = ['K', 'BB', '1B', '2B', '3B', 'HR'];

describe('RESULT_PRESENTATION', () => {
  it('모든 결과에 배지·아이콘·톤이 있다', () => {
    for (const result of ALL_RESULTS) {
      const presentation = RESULT_PRESENTATION[result];
      expect(presentation.label.length).toBeGreaterThan(0);
      // 색만으로 의미를 전달하지 않으려면 아이콘이 반드시 있어야 한다.
      expect(presentation.icon.length).toBeGreaterThan(0);
      expect(['on-base', 'out', 'hr']).toContain(presentation.tone);
    }
  });

  it('아웃만 onBase=false다', () => {
    const notOnBase = ALL_RESULTS.filter((r) => !RESULT_PRESENTATION[r].onBase);
    expect(notOnBase).toEqual(['K']);
  });

  it('출루 결과와 아웃의 톤이 다르다', () => {
    expect(RESULT_PRESENTATION['1B'].tone).not.toBe(RESULT_PRESENTATION.K.tone);
    expect(RESULT_PRESENTATION.HR.tone).toBe('hr');
  });
});

describe('resultLabel', () => {
  it('시간초과 삼진은 루킹 삼진으로 읽는다', () => {
    expect(resultLabel('K', true)).toBe('루킹 삼진 · 아웃');
    expect(resultLabel('K', false)).toBe('삼진 · 아웃');
  });

  it('출루 결과는 시간초과 여부와 무관하다', () => {
    for (const result of ALL_RESULTS.filter((r) => r !== 'K')) {
      expect(resultLabel(result, true)).toBe(resultLabel(result, false));
    }
  });
});

describe('UPGRADE_LABEL', () => {
  it('세 가지 사유가 모두 서로 다른 문구다', () => {
    const labels = [UPGRADE_LABEL.hard, UPGRADE_LABEL.streak, UPGRADE_LABEL.both];
    expect(new Set(labels).size).toBe(3);
  });

  it('사유마다 무엇이 올랐는지 밝힌다', () => {
    for (const label of Object.values(UPGRADE_LABEL)) {
      expect(label).toContain('한 단계 상승');
    }
  });
});

describe('DIFFICULTY_LABEL', () => {
  it('초급·중급·고급으로 표기한다', () => {
    expect(DIFFICULTY_LABEL).toEqual({ easy: '초급', normal: '중급', hard: '고급' });
  });
});

describe('MODE_LABEL', () => {
  it('P1 모드에 모두 라벨이 있다', () => {
    for (const mode of ['trial', 'official_3', 'full_9', 'daily']) {
      expect(MODE_LABEL[mode]).toBeTruthy();
    }
  });
});

describe('formatElapsed', () => {
  it('소수 한 자리 초로 표기한다', () => {
    expect(formatElapsed(3420)).toBe('3.4초');
    expect(formatElapsed(0)).toBe('0.0초');
    expect(formatElapsed(15000)).toBe('15.0초');
  });

  it('null은 하이픈', () => {
    expect(formatElapsed(null)).toBe('-');
  });
});
