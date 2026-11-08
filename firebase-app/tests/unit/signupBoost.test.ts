import { describe, expect, it } from 'vitest';
import * as ops from '../../ops/monthly.mjs';
import { versionInForce } from '@/content/privacy';
import { WELCOME_BONUS_POINTS, WELCOME_BONUS_START, welcomeBonusOpen, worthKeeping } from '@/lib/game/welcome';
import { KBO_QUIZ_START } from '@/lib/kbo/set';
import { cardSummary } from '@/lib/share/resultCard';

/** 가입 유도 1차(docs/signup-boost.md) */
describe('가입 축하 포인트', () => {
  it('화면과 운영 작업의 시작일·값이 같고, 처리방침 개정판과 같은 날 시작한다', () => {
    expect(ops.WELCOME_BONUS_START).toBe(WELCOME_BONUS_START);
    expect(ops.WELCOME_BONUS_POINTS).toBe(WELCOME_BONUS_POINTS);
    expect(WELCOME_BONUS_START).toBe(KBO_QUIZ_START);
    expect(welcomeBonusOpen('2026-11-19')).toBe(false);
    expect(welcomeBonusOpen(WELCOME_BONUS_START)).toBe(true);
  });

  it('시행되는 처리방침에 적혀 있고, 그 전 판에는 없다', () => {
    expect(JSON.stringify(versionInForce(WELCOME_BONUS_START))).toContain('가입 축하 포인트');
    expect(JSON.stringify(versionInForce('2026-11-19'))).not.toContain('가입 축하 포인트');
  });
});

describe('잘한 순간·결과 카드', () => {
  it('2안타 이상이거나 홈런이면 가입을 권한다', () => {
    expect(worthKeeping(1, 0)).toBe(false);
    expect(worthKeeping(2, 0)).toBe(true);
    expect(worthKeeping(1, 1)).toBe(true);
    expect(worthKeeping(0, 0)).toBe(false);
  });

  it('결과 카드 요약 글', () => {
    expect(cardSummary({ h: 3, hr: 1, bb: 0, so: 3 })).toBe('3안타 · 1홈런 · 3아웃');
    expect(cardSummary({ h: 0, hr: 0, bb: 1, so: 0 })).toBe('1볼넷');
    expect(cardSummary({ h: 0, hr: 0, bb: 0, so: 0 })).toBe('기록 없음');
  });
});
