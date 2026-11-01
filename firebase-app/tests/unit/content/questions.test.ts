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
/**
 * B구간 문항(data/questions.history-b.csv, 2026-11-01 618문항) — 출처가 위키백과. 한국시리즈가 끝나 사실 표에 한 줄을 더하면
 * 문항이 늘어나므로 수는 "618 이상"으로 본다
 */
const HISTORY_MIN = 618;
const isHistory = (q: Question) => /^https:\/\/(ko|en)\.wikipedia\.org\//.test(q.source.url ?? '');
const history = bank.filter(isHistory);
const legacy = bank.filter((q) => !isHistory(q) && q.recordAsOf !== RECENT_AS_OF);

describe('정적 문제은행', () => {
  it('기존 505 + 최신 경기 11 + B구간(618 이상), ID·본문이 겹치지 않고 ID는 규칙 형식(^q[0-9a-f]{12}$)', () => {
    expect(legacy).toHaveLength(505);
    expect(history.length).toBeGreaterThanOrEqual(HISTORY_MIN);
    expect(bank).toHaveLength(505 + RECENT_COUNT + history.length);
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

  it('B구간 문항: 한국시리즈·구단 역사·선수 수상만, 시즌 표기·출처 주소, 보기 4개가 서로 다르다, "최신 경기"로 잡히지 않는다', () => {
    const count = (category: string) => history.filter((q) => q.category === category).length;
    expect(count('korean-series') + count('team-history') + count('player-stats')).toBe(history.length);
    for (const q of history) {
      expect(q.seasonScope ?? '', q.stem).toMatch(/^\d{4} 시즌(까지)?$/);
      expect(q.source.url ?? '', q.stem).toMatch(/^https:\/\/(ko|en)\.wikipedia\.org\//);
      expect(new Set(q.options.map((o) => o.text)).size, q.stem).toBe(4);
      // 기준일은 그 시즌(또는 "…시즌까지"의 마지막 시즌) 안 — 오늘 기준 "최신 경기"는 막 끝난 한국시리즈만
      expect(q.recordAsOf.slice(0, 4), q.stem).toBe(q.seasonScope!.slice(0, 4));
    }
    const share = Math.max(...['A', 'B', 'C', 'D'].map((label) => history.filter((q) => q.correct === label).length)) / history.length;
    expect(share).toBeLessThan(0.3); // 정답 위치가 한쪽에 몰리지 않는다
  });

  it('문제은행 전체 난이도는 쉬움·보통·어려움 500:500:400 비율(운영자 결정 2026-11-01)', () => {
    const count = (d: string) => bank.filter((q) => q.difficulty === d).length;
    // 11-01: 405·405·324. 문항이 늘면 make-history-questions.mjs가 다시 나눈다 — 목표에서 1문항 안쪽
    expect(Math.abs(count('easy') - Math.round((bank.length * 5) / 14))).toBeLessThanOrEqual(1);
    expect(Math.abs(count('normal') - Math.round((bank.length * 5) / 14))).toBeLessThanOrEqual(1);
    expect(count('easy') / bank.length).toBeCloseTo(5 / 14, 2);
    expect(count('hard') / bank.length).toBeCloseTo(4 / 14, 2);
  });
});
