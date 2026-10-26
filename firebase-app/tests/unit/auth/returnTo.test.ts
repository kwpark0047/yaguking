import { describe, expect, it } from 'vitest';
import { DEFAULT_RETURN_TO, sanitizeReturnTo, withFlag } from '@/lib/auth/returnTo';

describe('sanitizeReturnTo', () => {
  it('내부 경로는 그대로 쓴다', () => {
    expect(sanitizeReturnTo('/play/abc/result')).toBe('/play/abc/result');
    expect(sanitizeReturnTo('/onboarding?step=2')).toBe('/onboarding?step=2');
  });

  it('없으면 기본값', () => {
    expect(sanitizeReturnTo(null)).toBe(DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo(undefined)).toBe(DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo('')).toBe(DEFAULT_RETURN_TO);
  });

  it('외부 절대 URL은 거부한다', () => {
    expect(sanitizeReturnTo('https://evil.example')).toBe(DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo('http://evil.example/path')).toBe(DEFAULT_RETURN_TO);
  });

  it('프로토콜 상대 URL도 거부한다', () => {
    expect(sanitizeReturnTo('//evil.example')).toBe(DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo('/\\evil.example')).toBe(DEFAULT_RETURN_TO);
  });

  it('스킴이 섞인 값도 거부한다', () => {
    expect(sanitizeReturnTo('javascript:alert(1)')).toBe(DEFAULT_RETURN_TO);
    expect(sanitizeReturnTo('mailto:a@b.c')).toBe(DEFAULT_RETURN_TO);
  });
});

describe('withFlag', () => {
  it('쿼리가 없으면 ?로 붙인다', () => {
    expect(withFlag('/play/1/result', 'claimed', '1')).toBe('/play/1/result?claimed=1');
  });

  it('쿼리가 있으면 &로 잇는다', () => {
    expect(withFlag('/a?b=1', 'claimed', '1')).toBe('/a?b=1&claimed=1');
  });

  it('값을 인코딩한다', () => {
    expect(withFlag('/a', 'msg', 'a b&c')).toBe('/a?msg=a%20b%26c');
  });
});
