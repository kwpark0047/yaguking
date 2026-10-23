import { describe, expect, it } from 'vitest';
import {
  NICKNAME_MAX,
  NICKNAME_MESSAGE,
  NICKNAME_MIN,
  suggestNickname,
  validateNickname,
} from '@/lib/game/nickname';

describe('suggestNickname', () => {
  it('항상 길이 제한을 만족한다', () => {
    for (let i = 0; i < 200; i += 1) {
      const nickname = suggestNickname();
      expect(nickname.length).toBeGreaterThanOrEqual(NICKNAME_MIN);
      expect(nickname.length).toBeLessThanOrEqual(NICKNAME_MAX);
    }
  });

  it('난수를 고정하면 결과가 결정적이다', () => {
    const fixed = () => 0;
    expect(suggestNickname(fixed)).toBe(suggestNickname(fixed));
  });

  it('난수 경계값 1 근처에서도 항목을 벗어나지 않는다', () => {
    const nickname = suggestNickname(() => 0.999999);
    expect(nickname.length).toBeGreaterThanOrEqual(NICKNAME_MIN);
    expect(nickname).not.toContain('undefined');
  });

  it('숫자 꼬리는 두 자리다', () => {
    const nickname = suggestNickname(() => 0);
    expect(nickname).toMatch(/\d{2}$/);
  });
});

describe('validateNickname', () => {
  it('정상 닉네임은 null', () => {
    expect(validateNickname('잠실야구왕')).toBeNull();
    expect(validateNickname('가나')).toBeNull();
  });

  it('공백만 있으면 blank', () => {
    expect(validateNickname('   ')).toBe('blank');
    expect(validateNickname('')).toBe('blank');
  });

  it('2자 미만은 too_short', () => {
    expect(validateNickname('가')).toBe('too_short');
  });

  it('16자 초과는 too_long', () => {
    expect(validateNickname('가'.repeat(17))).toBe('too_long');
    expect(validateNickname('가'.repeat(16))).toBeNull();
  });

  it('앞뒤 공백은 길이 계산에서 제외한다', () => {
    expect(validateNickname('  가나  ')).toBeNull();
  });

  it('모든 문제에 안내 문구가 있다', () => {
    for (const problem of ['blank', 'too_short', 'too_long'] as const) {
      expect(NICKNAME_MESSAGE[problem].length).toBeGreaterThan(0);
    }
  });
});
