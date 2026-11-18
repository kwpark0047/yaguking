import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_LARGE, contrastRatio } from '@/lib/design/contrast';
import { playOnPress } from '@/lib/sound/sound';
import { STYLES, SURFACES } from '@/lib/theme/base';
import { TEAM_IDENTITY, teamTheme, teamTokens } from '@/lib/theme/teams';

/** 메인 "게임 시작" 단추(StartButton) — 안쪽 장식만 움직이고, 화면 효과·동작 줄이기·고대비를 따르고, 소리는 소리 설정을 따른다 */
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
const css = read('../../src/app/globals.css');
const component = read('../../src/components/home/StartButton.tsx');
const sound = read('../../src/lib/sound/sound.ts');

describe('CSS — 단추 상자는 그대로, 장식만 opacity·transform으로', () => {
  it('키프레임은 opacity·transform만 바꾼다', () => {
    const frames = [...css.matchAll(/@keyframes (start-[\w-]+) \{([\s\S]*?)\n\}/g)];
    expect(frames.map((m) => m[1]).sort()).toEqual(['start-halo', 'start-nudge', 'start-shine']);
    for (const [, name, body] of frames) {
      const props = new Set([...(body ?? '').matchAll(/([\w-]+)\s*:/g)].map((m) => m[1]));
      expect([...props].every((p) => p === 'opacity' || p === 'transform'), `${name}: ${[...props].join(', ')}`).toBe(true);
    }
  });

  it('단추 자체(.start-cta)에는 애니메이션이 없다 — 자리가 흔들리지 않게', () => {
    const own = css.match(/\n\.start-cta \{([^}]*)\}/)?.[1];
    expect(own).toBeDefined();
    expect(own).not.toMatch(/animation/);
    expect(own).toMatch(/isolation:\s*isolate/);
  });

  it('장식은 글자 아래·누를 수 없음, 화면 읽기에서 숨김', () => {
    for (const selector of ['.start-cta::before', '.start-cta__shine']) {
      const body = css.match(new RegExp(`\\n${selector.replace(/[.:]/g, (c) => `\\${c}`)} \\{([^}]*)\\}`))?.[1];
      expect(body, selector).toMatch(/z-index:\s*-1/);
      expect(body, selector).toMatch(/pointer-events:\s*none/);
    }
    expect(component.match(/aria-hidden="true"/g)).toHaveLength(2);
    for (const name of new Set([...component.matchAll(/start-cta[\w-]*/g)].map((m) => m[0]))) expect(css, name).toContain(`.${name}`);
  });

  it('끄기·고대비: 빛 장식을 뺀다, 끄기는 ▶도 멈춘다', () => {
    const hidden = css.match(
      /:root\[data-effects='none'\] \.start-cta::before,\s*:root\[data-effects='none'\] \.start-cta__shine,\s*:root\[data-style='contrast'\] \.start-cta::before,\s*:root\[data-style='contrast'\] \.start-cta__shine \{([^}]*)\}/,
    )?.[1];
    expect(hidden).toMatch(/display:\s*none/);
    expect(css).toMatch(/:root\[data-effects='none'\] \.start-cta__icon \{\s*animation: none;/);
  });

  it('줄이기: 지나가는 빛·▶ 움직임은 빼고 둘레 빛만 더 느리게', () => {
    expect(css).toMatch(/:root\[data-effects='calm'\] \.start-cta__shine \{\s*display: none;/);
    expect(css).toMatch(/:root\[data-effects='calm'\] \.start-cta__icon \{\s*animation: none;/);
    expect(css).toMatch(/:root\[data-effects='calm'\] \.start-cta::before \{\s*animation-duration: 5s;/);
  });

  it('기기의 동작 줄이기에서도 멈춘다(설정이 적히기 전에도)', () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.start-cta::before,\s*\.start-cta__shine \{\s*display: none;\s*\}\s*\.start-cta__icon \{\s*animation: none;/,
    );
  });
});

describe('지나가는 빛이 단추 글자 대비를 해치지 않는다(모든 테마·구단·밝고 어두운 화면)', () => {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  /** 바탕 위에 색을 alpha만큼 겹친 결과 */
  const over = (base: string, color: number[], alpha: number) => toHex(hex(base).map((v, i) => v * (1 - alpha) + color[i]! * alpha));
  const pairs: [string, string, string][] = [];
  for (const style of STYLES) for (const scheme of ['dark', 'light'] as const) pairs.push([`${style}·${scheme}`, SURFACES[style][scheme].accent, SURFACES[style][scheme].accentInk]);
  for (const slug of Object.keys(TEAM_IDENTITY))
    for (const scheme of ['dark', 'light'] as const)
      for (const style of ['default', 'contrast'] as const) {
        const tokens = teamTokens(teamTheme(slug), scheme, style);
        pairs.push([`${slug}·${scheme}·${style}`, tokens.accent, tokens.accentInk]);
      }

  it('빛 색은 글자색의 반대(상대 색) — 겹치면 대비가 늘기만 한다', () => {
    const alpha = Number(css.match(/--start-shine: rgb\(from var\(--accent-ink\) calc\(255 - r\) calc\(255 - g\) calc\(255 - b\) \/ ([\d.]+)\)/)?.[1]);
    expect(alpha).toBeGreaterThan(0);
    for (const [name, accent, ink] of pairs) {
      const inverse = hex(ink).map((v) => 255 - v);
      expect(contrastRatio(over(accent, inverse, alpha), ink), name).toBeGreaterThanOrEqual(contrastRatio(accent, ink));
    }
  });

  it('상대 색을 모르는 브라우저의 옅은 흰빛도 큰 글자 기준(3:1)을 지킨다', () => {
    const alpha = Number(css.match(/--start-shine: rgb\(255 255 255 \/ ([\d.]+)\)/)?.[1]);
    expect(alpha).toBeGreaterThan(0);
    for (const [name, accent, ink] of pairs) expect(contrastRatio(over(accent, [255, 255, 255], alpha), ink), name).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe('소리 — 누르면 방망이 소리와 응원 소리, 소리 설정을 따른다', () => {
  it('playBall 소리가 있고, 단추가 누를 때 낸다', () => {
    expect(sound).toMatch(/\| 'playBall'/);
    expect(sound).toMatch(/\n {2}playBall: \(c, o, t\) =>/);
    expect(component).toContain("onClick={() => playOnPress('playBall')}");
  });

  it('소리가 꺼져 있으면(기본) 아무것도 하지 않는다', () => {
    expect(() => playOnPress('playBall')).not.toThrow();
  });
});
