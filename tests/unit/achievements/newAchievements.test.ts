import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NewAchievements } from '@/components/result/NewAchievements';
import type { AchievementDto } from '@/types/api';

/** 경기 결과 화면의 "새 업적 카드" 구역 (14 문서 §5.2). */

const card = (id: string, rarity: number): AchievementDto => ({
  id,
  title: `업적 ${id}`,
  condition: '조건',
  rarity,
  earned: true,
  earnedOn: '2026-10-26',
});

const render = (achievements: AchievementDto[]) =>
  renderToStaticMarkup(createElement(NewAchievements, { achievements }));

describe('NewAchievements', () => {
  it('새 카드가 없으면 아무것도 그리지 않는다', () => {
    expect(render([])).toBe('');
  });

  it('장 수를 제목에 밝히고 컬렉션으로 가는 길을 둔다', () => {
    const html = render([card('first_hit', 1), card('first_hr', 2)]);
    expect(html).toMatch(/<h2 id="new-achievements-title"[^>]*>새 업적 카드 <span[^>]*>2<\/span>장<\/h2>/);
    expect(html).toContain('href="/me/collection"');
  });

  it('카드 제목은 구역 제목(h2) 아래 h3다', () => {
    const html = render([card('first_hit', 1)]);
    expect(html).toMatch(/<h3 id="achievement-first_hit"[^>]*>업적 first_hit<\/h3>/);
    expect(html).not.toMatch(/<h2 id="achievement-/);
  });

  it('획득한 카드로 그린다 — 실루엣이 아니다', () => {
    const html = render([card('cycle', 5)]);
    expect(html).not.toContain('data-locked');
    expect(html).toContain('data-material="foil"');
    expect(html).toContain('획득 · 2026-10-26');
  });
});
