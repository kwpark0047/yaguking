import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FLOODLIGHT_CORE, FLOODLIGHTS, HAZE, SKY_ASPECT, SKY_VIEWBOX, TWINKLE_GROUPS } from '@/lib/home/heroSky';

/** 메인 히어로 바탕 움직임(HeroSky) — 그림과 겹치는 자리, 합성만 쓰는 움직임, 화면 효과·동작 줄이기·고대비에서 멈춤 */
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const css = read('../../src/app/globals.css');
const svg = read('../../src/assets/brand/night-stadium.svg');
const component = read('../../src/components/home/HeroSky.tsx');

/** `selector { … }` 블록 본문(맨 처음 것) */
function rule(selector: string): string | undefined {
  const escaped = selector.replace(/[[\]'().*:,]/g, (c) => `\\${c}`);
  return css.match(new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`))?.[1];
}

describe('바탕 그림과 같은 판에 겹친다', () => {
  it('viewBox·맞춤 방식이 night-stadium.svg와 같다', () => {
    expect(svg).toContain(`viewBox="${SKY_VIEWBOX}"`);
    expect(svg).toContain(`preserveAspectRatio="${SKY_ASPECT}"`);
  });

  it('조명 자리가 그림의 glow 원과 같다', () => {
    const glows = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="url\(#glow\)"/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      r: Number(m[3]),
    }));
    expect(glows).toEqual(FLOODLIGHTS);
    expect(FLOODLIGHT_CORE).toBeLessThan(1); // 등의 가운데만 — 글자 뒤 넓은 번짐은 그대로
  });

  it('별은 하늘(지붕선 위)에만, 조명 번짐과 겹치지 않고, 폰에서 보이는 가운데에도 무리마다 있다', () => {
    expect(TWINKLE_GROUPS).toHaveLength(3);
    for (const stars of TWINKLE_GROUPS) {
      expect(stars.some((s) => s.x >= 430 && s.x <= 770)).toBe(true);
      for (const s of stars) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(1200);
        expect(s.y).toBeLessThan(120);
        for (const light of FLOODLIGHTS) expect(Math.hypot(s.x - light.x, s.y - light.y)).toBeGreaterThan(light.r + s.r);
      }
    }
    expect(HAZE.y - HAZE.ry).toBeGreaterThanOrEqual(0);
  });
});

describe('CSS — 투명도·위치만 움직이고, 설정에 따라 멈춘다', () => {
  it('히어로 바탕 움직임의 키프레임은 opacity·transform만 바꾼다', () => {
    const frames = [...css.matchAll(/@keyframes (hero-[\w-]+) \{([\s\S]*?)\n\}/g)];
    expect(frames.map((m) => m[1]).sort()).toEqual(['hero-glow', 'hero-haze', 'hero-twinkle', 'hero-twinkle-calm']);
    for (const [, name, body] of frames) {
      const props = new Set([...(body ?? '').matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]));
      expect([...props].every((p) => p === 'opacity' || p === 'transform'), `${name}: ${[...props].join(', ')}`).toBe(true);
    }
  });

  it('부품이 쓰는 층 이름이 모두 CSS에 있다', () => {
    const classes = new Set([...component.matchAll(/hero-sky[\w-]*/g)].map((m) => m[0]));
    expect(classes.size).toBeGreaterThanOrEqual(4);
    for (const name of classes) expect(css, name).toContain(`.${name}`);
  });

  it('꾸밈 층 — 글자 아래, 누를 수 없음, 화면 읽기에서 숨김', () => {
    expect(rule('.hero-sky')).toMatch(/z-index:\s*-1/);
    expect(rule('.hero-sky')).toMatch(/pointer-events:\s*none/);
    expect(component).toContain('aria-hidden="true"');
  });

  it('화면 효과 끄기·고대비에서 층을 뺀다(원래 그림 그대로)', () => {
    const none = css.match(/:root\[data-effects='none'\] \.hero-sky,\s*:root\[data-style='contrast'\] \.hero-sky \{([^}]*)\}/)?.[1];
    expect(none).toMatch(/display:\s*none/);
  });

  it('기기의 동작 줄이기에서도 뺀다(설정이 적히기 전에도)', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.hero-sky \{\s*display: none;/);
  });

  it('줄이기(calm): 조명·안개는 빼고 별빛만 더 느리고 약하게', () => {
    expect(rule(":root[data-effects='calm'] :is(.hero-sky__haze, .hero-sky__lights)")).toMatch(/display:\s*none/);
    const calm = rule(":root[data-effects='calm'] .hero-sky__stars");
    expect(calm).toMatch(/animation-name:\s*hero-twinkle-calm/);
    const seconds = (body: string | undefined) => Number(body?.match(/animation(?:-duration)?:[^;]*?([\d.]+)s/)?.[1]);
    expect(seconds(calm)).toBeGreaterThan(seconds(rule('.hero-sky__stars')) * 2);
  });
});
