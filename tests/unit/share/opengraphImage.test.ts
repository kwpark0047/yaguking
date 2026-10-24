import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareCardDto } from '@/types/api';

/**
 * 공유 카드 OG 이미지 렌더 (src/app/share/[sessionId]/opengraph-image.tsx).
 *
 * 이 이미지는 **조용히** 두 번 깨져 있었다.
 *   1) Next 16에서 `params`가 Promise인데 동기로 읽어 세션 ID가 늘 undefined
 *      → 실제 기록 대신 기본값("야구왕 · 0득점")만 그려졌다
 *   2) Satori는 0이 아닌 숫자 자식을 받으면 실패한다 → 1점 이상이면 500
 * 1)이 2)를 가려서, 화면에서는 "이미지가 나온다"로만 보였다. 그래서 **실제
 * 기록**으로 렌더해 본다.
 */

const card = vi.hoisted(() => ({ value: null as ShareCardDto | null, sessionId: '' }));

vi.mock('@/server/share/shareCard', () => ({
  getShareCard: async (sessionId: string) => {
    card.sessionId = sessionId;
    return card.value;
  },
}));

const sample: ShareCardDto = {
  nickname: '운영자',
  levelName: '명예의 전당',
  level: 7,
  teamSlug: 'hanwha',
  teamShortName: '한화',
  runs: 3,
  pa: 17,
  avg: '.308',
  ops: '.779',
};

const realFetch = globalThis.fetch;

beforeEach(() => {
  // 글꼴은 Google Fonts에서 받는다. 테스트가 네트워크에 기대지 않게 막고,
  // 글꼴 없이도 렌더가 성공하는지 본다(실패 시 기본 글꼴로 그리는 경로).
  globalThis.fetch = (async () => {
    throw new Error('network disabled in test');
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  card.value = null;
});

async function render(sessionId: string) {
  const { default: Image } = await import('@/app/share/[sessionId]/opengraph-image');
  const response = (await Image({ params: Promise.resolve({ sessionId }) })) as Response;
  return new Uint8Array(await response.arrayBuffer());
}

describe('공유 카드 OG 이미지', () => {
  it('세션 ID를 Promise에서 꺼내 카드를 조회한다', async () => {
    card.value = sample;
    await render('session-123');
    expect(card.sessionId).toBe('session-123');
  });

  it('1점 이상인 실제 기록으로 PNG가 나온다', async () => {
    card.value = sample;
    const png = await render('s');
    // PNG 시그니처
    expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(png.byteLength).toBeGreaterThan(1000);
  });

  it.each([1, 7, 10, 23])('득점 %i점도 렌더된다', async (runs) => {
    card.value = { ...sample, runs };
    await expect(render('s')).resolves.toBeInstanceOf(Uint8Array);
  });

  it('구단·등급이 없는 비회원 기록도 렌더된다', async () => {
    card.value = { ...sample, teamSlug: null, teamShortName: null, level: 1, levelName: '육성선수' };
    await expect(render('s')).resolves.toBeInstanceOf(Uint8Array);
  });

  it('카드가 없으면 기본값으로 렌더된다', async () => {
    card.value = null;
    await expect(render('missing')).resolves.toBeInstanceOf(Uint8Array);
  });
});
