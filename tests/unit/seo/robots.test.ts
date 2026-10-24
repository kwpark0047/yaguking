import { afterEach, describe, expect, it } from 'vitest';
import robots from '@/app/robots';
import { indexingAllowed } from '@/lib/seo/indexing';

/**
 * 검색 노출 스위치 (11 문서 §3).
 *
 * 이 테스트가 지키는 것은 **환경변수를 깜빡하면 차단 쪽으로 틀린다**는
 * 성질이다. 소규모 노출 중에 검색 유입이 섞이면 퍼널 수치가 더러워진다.
 */

const original = process.env.SEARCH_INDEXING;

afterEach(() => {
  if (original === undefined) delete process.env.SEARCH_INDEXING;
  else process.env.SEARCH_INDEXING = original;
});

describe('indexingAllowed', () => {
  it('설정이 없으면 차단한다', () => {
    delete process.env.SEARCH_INDEXING;
    expect(indexingAllowed()).toBe(false);
  });

  it('allow 외의 값은 모두 차단한다', () => {
    for (const value of ['', 'true', '1', 'yes', 'ALLOW', 'allowed']) {
      process.env.SEARCH_INDEXING = value;
      expect(indexingAllowed()).toBe(false);
    }
  });

  it('정확히 allow일 때만 연다', () => {
    process.env.SEARCH_INDEXING = 'allow';
    expect(indexingAllowed()).toBe(true);
  });
});

describe('robots.txt', () => {
  it('기본은 모든 경로를 막는다', () => {
    delete process.env.SEARCH_INDEXING;
    expect(robots().rules).toEqual([{ userAgent: '*', disallow: '/' }]);
  });

  it('열어도 경기·운영·인증 경로는 막는다', () => {
    process.env.SEARCH_INDEXING = 'allow';
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule?.allow).toBe('/');
    expect(rule?.disallow).toEqual(
      expect.arrayContaining(['/api/', '/admin/', '/auth/', '/play/']),
    );
  });
});
