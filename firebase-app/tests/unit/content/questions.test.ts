import { describe, expect, it } from 'vitest';
import questions from '@/content/questions.generated.json';
import type { Question } from '@/content/questions';

/**
 * 정적 문제은행(scripts/build-questions.mjs) — 기존 DB 문제은행과 같은지.
 * 기준값은 기존 앱 `npm run content:check`(2026-10-26): 505문항, 정답 A147/B108/C140/D110,
 * 난이도 202/202/101.
 */
const bank = questions as Question[];

describe('정적 문제은행', () => {
  it('505문항, ID·본문이 겹치지 않고 ID는 규칙 형식(^q[0-9a-f]{12}$)', () => {
    expect(bank).toHaveLength(505);
    expect(new Set(bank.map((q) => q.id)).size).toBe(bank.length);
    expect(new Set(bank.map((q) => q.stem)).size).toBe(bank.length);
    for (const q of bank) expect(q.id).toMatch(/^q[0-9a-f]{12}$/);
  });

  it('보기는 A~D 한 번씩, 정답은 그중 하나', () => {
    for (const q of bank) {
      expect(q.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);
      expect(['A', 'B', 'C', 'D']).toContain(q.correct);
    }
  });

  it('정답 위치 분포가 기존 문제은행과 같다 — 같은 섞기를 썼다', () => {
    const count = (label: string) => bank.filter((q) => q.correct === label).length;
    expect([count('A'), count('B'), count('C'), count('D')]).toEqual([147, 108, 140, 110]);
  });

  it('난이도 40/40/20, 모든 문항에 출처가 있다', () => {
    const count = (d: string) => bank.filter((q) => q.difficulty === d).length;
    expect([count('easy'), count('normal'), count('hard')]).toEqual([202, 202, 101]);
    for (const q of bank) {
      expect(q.source.name.length).toBeGreaterThan(0);
      expect(q.source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
