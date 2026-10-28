import { afterEach, describe, expect, it, vi } from 'vitest';
import { planFor } from '@/lib/effects/catalog';
import { LEVEL_THRESHOLDS, levelChange, levelForXp } from '@/lib/game/labels';
import { firstOfGame } from '@/lib/game/moments';
import { DEFAULT_SOUND, SOUND_KEY, gameEndSound, readSound, saveSound, verdictSound } from '@/lib/sound/sound';

/** 애니메이션 2차·소리(docs/motion-plan.md, docs/sound-plan.md) */
describe('첫 안타·첫 홈런(이번 경기 기준)', () => {
  const match = (...results: string[]) => ({ atBats: results.map((result) => ({ result })) }) as never;
  it('경기의 첫 안타는 배지, 첫 홈런은 도장 — 두 번째부터는 없음', () => {
    expect(firstOfGame(match('K', '1B'), { result: '1B' } as never)).toBe('hit');
    expect(firstOfGame(match('1B', '2B'), { result: '2B' } as never)).toBeNull();
    expect(firstOfGame(match('1B', 'HR'), { result: 'HR' } as never)).toBe('homeRun');
    expect(firstOfGame(match('HR', 'HR'), { result: 'HR' } as never)).toBeNull();
    expect(firstOfGame(match('BB'), { result: 'BB' } as never)).toBeNull(); // 볼넷은 안타가 아니다
    expect(firstOfGame(match('K'), { result: 'K' } as never)).toBeNull();
  });
});

describe('비공식 레벨 승급', () => {
  it('누적 XP → 레벨(임계값 하한)', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(LEVEL_THRESHOLDS[1] - 1)).toBe(1);
    expect(levelForXp(LEVEL_THRESHOLDS[1])).toBe(2);
    expect(levelForXp(1_000_000)).toBe(7);
  });
  it('이번 경기 XP를 더하기 전·후', () => {
    expect(levelChange(520, 60)).toEqual({ before: 1, after: 2, xpBefore: 460, xpAfter: 520 });
    expect(levelChange(30, 30)).toMatchObject({ before: 1, after: 1 });
    expect(levelChange(10, 50).xpBefore).toBe(0); // 음수가 되지 않는다
  });
  it('승급 효과는 큰 효과(금색 폭죽), 가입 환영·대결 우승은 중간', () => {
    expect(planFor({ kind: 'levelUp' }, 'full', 0).strength).toBe('big');
    expect(planFor({ kind: 'welcome' }, 'full', 0).steps.map((s) => s.part)).toEqual(['confetti']);
    expect(planFor({ kind: 'duelWin' }, 'full', 0).strength).toBe('medium');
    expect(planFor({ kind: 'levelUp' }, 'none', 0).steps).toEqual([]);
  });
});

describe('소리 — 기본 끔, 기기에만 저장', () => {
  // 단위 테스트는 Node — 브라우저 저장소 대신 메모리
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  afterEach(() => store.clear());

  it('저장된 것이 없으면 끔·보통·버튼 소리 끔', () => {
    expect(readSound()).toEqual(DEFAULT_SOUND);
    expect(DEFAULT_SOUND).toEqual({ on: false, volume: 'mid', taps: false });
  });

  it('바꾼 것만 저장하고, 기본값으로 돌아가면 지운다', () => {
    saveSound({ on: true, volume: 'low', taps: false });
    expect(JSON.parse(localStorage.getItem(SOUND_KEY)!)).toEqual({ on: true, volume: 'low', taps: false });
    expect(readSound()).toEqual({ on: true, volume: 'low', taps: false });
    saveSound(DEFAULT_SOUND);
    expect(localStorage.getItem(SOUND_KEY)).toBeNull();
  });

  it('망가진 값은 기본으로', () => {
    localStorage.setItem(SOUND_KEY, '{"on":"yes","volume":"loud"}');
    expect(readSound()).toEqual({ on: false, volume: 'mid', taps: false });
    localStorage.setItem(SOUND_KEY, 'not json');
    expect(readSound()).toEqual(DEFAULT_SOUND);
  });

  it('판정 → 소리, 경기 종료 → 득점 단계(축하 효과와 같은 0 / 1~2 / 3+)', () => {
    expect(verdictSound('HR', false)).toBe('homeRun');
    expect(verdictSound('2B', false)).toBe('extraBase');
    expect(verdictSound('1B', false)).toBe('hit');
    expect(verdictSound('BB', false)).toBe('walk');
    expect(verdictSound('K', false)).toBe('out');
    expect(verdictSound('K', true)).toBe('timeout');
    expect([0, 1, 2, 3, 7].map(gameEndSound)).toEqual(['gameEnd0', 'gameEnd1', 'gameEnd1', 'gameEnd3', 'gameEnd3']);
  });
});
