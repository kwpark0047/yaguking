import { describe, expect, it } from 'vitest';
import questions from '@/content/questions.generated.json';
import type { Question } from '@/content/questions';

/**
 * 정적 문제은행(scripts/build-questions.mjs) — 기존 DB 문제은행과 같은지.
 * 기준값은 기존 앱 `npm run content:check`(2026-10-26): 505문항, 정답 A147/B108/C140/D110,
 * 난이도 202/202/101. 그 뒤 더한 문항(최신 경기 — data/questions.recent-2026.csv, 기준일 2026-10-28)은 따로 센다:
 * 기존 505문항은 기존 앱과 같은 섞기 그대로인지 계속 확인한다.
 */
const bank = questions as Question[];
const RECENT_AS_OF = '2026-10-28';
const RECENT_COUNT = 11;
const legacy = bank.filter((q) => q.recordAsOf !== RECENT_AS_OF);

describe('정적 문제은행', () => {
  it('기존 505 + 최신 경기 11문항, ID·본문이 겹치지 않고 ID는 규칙 형식(^q[0-9a-f]{12}$)', () => {
    expect(legacy).toHaveLength(505);
    expect(bank).toHaveLength(505 + RECENT_COUNT);
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

  it('정답 위치 분포가 기존 문제은행과 같다 — 같은 섞기를 썼다(기존 505문항)', () => {
    const count = (label: string) => legacy.filter((q) => q.correct === label).length;
    expect([count('A'), count('B'), count('C'), count('D')]).toEqual([147, 108, 140, 110]);
  });

  it('난이도 40/40/20(기존 505문항), 모든 문항에 출처가 있다', () => {
    const count = (d: string) => legacy.filter((q) => q.difficulty === d).length;
    expect([count('easy'), count('normal'), count('hard')]).toEqual([202, 202, 101]);
    for (const q of bank) {
      expect(q.source.name.length).toBeGreaterThan(0);
      expect(q.source.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('최신 경기 문항: 시즌 표기·출처 주소가 있고, 정답 위치가 한쪽에 몰리지 않는다', () => {
    const recent = bank.filter((q) => q.recordAsOf === RECENT_AS_OF);
    expect(recent).toHaveLength(RECENT_COUNT);
    for (const q of recent) {
      expect(q.seasonScope, q.stem).toBe('2026 시즌');
      expect(q.source.url ?? '', q.stem).toMatch(/^https:\/\//);
    }
    const most = Math.max(...['A', 'B', 'C', 'D'].map((label) => recent.filter((q) => q.correct === label).length));
    expect(most).toBeLessThanOrEqual(4);
  });
});
