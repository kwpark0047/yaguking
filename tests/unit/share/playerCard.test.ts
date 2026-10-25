import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayerCard } from '@/components/share/PlayerCard';
import {
  MATERIALS,
  MATERIAL_INLAY,
  cardInitial,
  materialFill,
  mixHex,
} from '@/lib/theme/material';
import { SURFACES } from '@/lib/theme/base';
import { MAX_LEVEL, tierTheme } from '@/lib/theme/tiers';
import type { ShareCardDto } from '@/types/api';

/**
 * 내 선수 카드 (14 문서 §5.1, 1단계 — CSS만으로).
 */

const sample: ShareCardDto = {
  nickname: '운영자',
  levelName: '골든글러브',
  level: 5,
  teamSlug: 'lg',
  teamShortName: 'LG',
  runs: 3,
  pa: 17,
  avg: '.308',
  ops: '.779',
};

function render(card: ShareCardDto): string {
  return renderToStaticMarkup(createElement(PlayerCard, { card, headingId: 'card-name' }));
}

describe('카드 가운데 글자', () => {
  it.each([
    ['운영자', '운'],
    ['kim', 'K'],
    ['  야구왕  ', '야'],
    ['', '?'],
    ['   ', '?'],
  ])('%j → %j', (nickname, expected) => {
    expect(cardInitial(nickname)).toBe(expected);
  });

  it('결합된 이모지를 반으로 자르지 않는다', () => {
    const family = '👨‍👩‍👧';
    expect(cardInitial(`${family}팬`)).toBe(family);
  });
});

describe('등급별 소재', () => {
  it('일곱 등급이 모두 다른 소재를 등급 순서대로 쓴다', () => {
    const materials = Array.from({ length: MAX_LEVEL }, (_, i) => tierTheme(i + 1).material);
    expect(materials).toEqual(MATERIALS);
  });

  it('골든글러브는 실밥 선을 두른다', () => {
    expect(MATERIAL_INLAY[tierTheme(5).material]).toBe('dashed');
  });

  it.each(MATERIALS)('%s: OG용 면은 Satori가 읽는 색 값이다', (material) => {
    const fill = materialFill(material, '#e0a800', SURFACES.default.dark);
    expect(fill.backgroundColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(fill.backgroundImage).toMatch(/^linear-gradient\(/);
    // CSS 변수·color-mix는 Satori가 모른다
    expect(fill.backgroundImage).not.toMatch(/var\(|color-mix/);
  });

  it('mixHex는 양 끝과 가운데를 맞게 섞는다', () => {
    expect(mixHex('#ffffff', '#000000', 1)).toBe('#ffffff');
    expect(mixHex('#ffffff', '#000000', 0)).toBe('#000000');
    expect(mixHex('#ff0000', '#0000ff', 0.5)).toBe('#800080');
  });
});

describe('선수 카드 마크업', () => {
  it('닉네임이 카드의 이름이 되고, 기록 네 개를 글자로 담는다', () => {
    const html = render(sample);
    expect(html).toContain('aria-labelledby="card-name"');
    expect(html).toMatch(/<h1 id="card-name"[^>]*>운영자<\/h1>/);
    for (const text of ['득점', '타석', '타율', 'OPS', '.308', '.779', '17']) {
      expect(html).toContain(text);
    }
  });

  it('등급 배지와 구단명은 글자로 나온다', () => {
    const html = render(sample);
    expect(html).toContain('Lv.5');
    expect(html).toContain('골든글러브');
    expect(html).toContain('LG');
  });

  it('그림을 쓰지 않는다 — 로고·이미지 요소가 없다', () => {
    const html = render(sample);
    expect(html).not.toMatch(/<img|<svg|background-image:\s*url/i);
  });

  it('큰 글자는 장식이라 낭독에서 뺀다', () => {
    expect(render(sample)).toMatch(/class="player-card__initial" aria-hidden="true">운</);
  });

  it.each(Array.from({ length: MAX_LEVEL }, (_, i) => i + 1))(
    'Lv.%i 카드는 그 등급의 소재와 테두리를 단다',
    (level) => {
      const tier = tierTheme(level);
      const html = render({ ...sample, level, levelName: tier.name });
      expect(html).toContain(`data-tier="${level}"`);
      expect(html).toContain(`data-ornament="${tier.ornament}"`);
      expect(html).toContain(`data-material="${tier.material}"`);
    },
  );

  it('비회원 카드는 브랜드 테마이고 구단명이 없다', () => {
    const html = render({
      ...sample,
      nickname: '비회원',
      level: 1,
      levelName: '육성선수',
      teamSlug: null,
      teamShortName: null,
    });
    expect(html).toContain('data-team="brand"');
    expect(html).toContain('data-material="paper"');
    expect(html).not.toContain('team-dot');
  });
});
