import { describe, expect, it } from 'vitest';
import { applyAtBat, initialState } from '@/lib/engine/session';
import type { SessionGoal, SessionState } from '@/lib/engine/types';

const innings = (n: number): SessionGoal => ({ kind: 'innings', innings: n });
const pa = (n: number): SessionGoal => ({ kind: 'pa', pa: n });

/** 07 문서 §10 TC 15~16 — 이닝 전이와 종료 조건. */
describe('applyAtBat — 아웃과 이닝 전이', () => {
  it('아웃 1개는 카운트만 올린다', () => {
    const next = applyAtBat(initialState(), 'K', innings(1));
    expect(next.outs).toBe(1);
    expect(next.inning).toBe(1);
    expect(next.finished).toBe(false);
    expect(next.inningEnded).toBe(false);
  });

  it('TC15: 3연속 아웃이면 이닝이 넘어가고 주자·아웃이 초기화된다', () => {
    let state: SessionState = initialState();
    const goal = innings(3);

    state = applyAtBat(state, '2B', goal); // 주자 2루
    expect(state.bases).toBe(2);

    state = applyAtBat(state, 'K', goal);
    state = applyAtBat(state, 'K', goal);
    expect(state.outs).toBe(2);
    expect(state.bases).toBe(2);

    state = applyAtBat(state, 'K', goal);
    expect(state.inning).toBe(2);
    expect(state.outs).toBe(0);
    expect(state.bases).toBe(0);
    expect(state.inningEnded).toBe(true);
    expect(state.finished).toBe(false);
  });

  it('TC16: 1이닝 목표에서 3아웃이면 경기가 끝난다', () => {
    let state: SessionState = initialState();
    const goal = innings(1);

    state = applyAtBat(state, 'K', goal);
    state = applyAtBat(state, 'K', goal);
    expect(state.finished).toBe(false);

    state = applyAtBat(state, 'K', goal);
    expect(state.inning).toBe(2);
    expect(state.outs).toBe(0);
    expect(state.finished).toBe(true);
  });

  it('3이닝 목표는 아웃 9개에서 끝난다', () => {
    let state: SessionState = initialState();
    const goal = innings(3);
    for (let i = 0; i < 8; i += 1) {
      state = applyAtBat(state, 'K', goal);
      expect(state.finished).toBe(false);
    }
    state = applyAtBat(state, 'K', goal);
    expect(state.finished).toBe(true);
  });
});

describe('applyAtBat — 득점 누적', () => {
  it('타점이 누적 득점에 더해진다', () => {
    let state: SessionState = initialState();
    const goal = innings(1);

    state = applyAtBat(state, '1B', goal);
    state = applyAtBat(state, '1B', goal);
    state = applyAtBat(state, 'HR', goal);

    expect(state.rbi).toBe(3);
    expect(state.runs).toBe(3);
    expect(state.bases).toBe(0);
  });

  it('아웃 타석의 타점은 0이다', () => {
    const next = applyAtBat({ ...initialState(), bases: 7 }, 'K', innings(1));
    expect(next.rbi).toBe(0);
    expect(next.runs).toBe(0);
  });

  it('이닝이 넘어가도 누적 득점은 유지된다', () => {
    let state: SessionState = initialState();
    const goal = innings(2);
    state = applyAtBat(state, 'HR', goal);
    state = applyAtBat(state, 'K', goal);
    state = applyAtBat(state, 'K', goal);
    state = applyAtBat(state, 'K', goal);
    expect(state.inning).toBe(2);
    expect(state.runs).toBe(1);
  });
});

describe('applyAtBat — 타석 수 집계', () => {
  it('모든 타석이 paPlayed에 누적된다 (볼넷 포함)', () => {
    let state: SessionState = initialState();
    const goal = innings(1);
    state = applyAtBat(state, 'BB', goal);
    state = applyAtBat(state, 'K', goal);
    expect(state.paPlayed).toBe(2);
  });
});

describe('applyAtBat — 고정 타석 모드 (약점 코스 훈련)', () => {
  it('목표 타석 수에 도달하면 아웃과 무관하게 끝난다', () => {
    let state: SessionState = initialState();
    const goal = pa(5);
    for (let i = 0; i < 4; i += 1) {
      state = applyAtBat(state, 'K', goal);
      expect(state.finished).toBe(false);
    }
    state = applyAtBat(state, 'K', goal);
    expect(state.paPlayed).toBe(5);
    expect(state.finished).toBe(true);
  });

  it('고정 타석 모드에서도 3아웃이면 이닝은 초기화된다', () => {
    let state: SessionState = initialState();
    const goal = pa(10);
    state = applyAtBat(state, 'K', goal);
    state = applyAtBat(state, 'K', goal);
    state = applyAtBat(state, 'K', goal);
    expect(state.outs).toBe(0);
    expect(state.inning).toBe(2);
    expect(state.finished).toBe(false);
  });
});

describe('initialState', () => {
  it('1회 0아웃 주자 없음 0득점에서 시작한다', () => {
    expect(initialState()).toEqual({
      inning: 1,
      outs: 0,
      bases: 0,
      runs: 0,
      rbi: 0,
      paPlayed: 0,
      inningEnded: false,
      finished: false,
    });
  });
});
