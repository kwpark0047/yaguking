import { afterEach, describe, expect, it } from 'vitest';
import { clientAddress } from '@/server/security/rateLimit';

/**
 * 요청자 주소 고르기 (11 문서 §3).
 *
 * 리버스 프록시는 클라이언트가 보낸 `x-forwarded-for` 뒤에 실제 주소를
 * **덧붙인다.** 그래서 왼쪽 값은 클라이언트가 마음대로 정할 수 있고,
 * 오른쪽에서 신뢰 프록시 수만큼 들어간 자리만 믿을 수 있다.
 */

const original = process.env.TRUSTED_PROXY_COUNT;

afterEach(() => {
  if (original === undefined) delete process.env.TRUSTED_PROXY_COUNT;
  else process.env.TRUSTED_PROXY_COUNT = original;
});

function withHeaders(headers: Record<string, string>): Request {
  return new Request('http://localhost/', { headers });
}

describe('clientAddress', () => {
  it('프록시 하나(기본)면 가장 오른쪽 주소를 쓴다', () => {
    delete process.env.TRUSTED_PROXY_COUNT;
    expect(
      clientAddress(withHeaders({ 'x-forwarded-for': 'spoofed, 198.51.100.1' })),
    ).toBe('198.51.100.1');
  });

  it('왼쪽 값을 바꿔도 결과가 같다', () => {
    delete process.env.TRUSTED_PROXY_COUNT;
    const real = '198.51.100.2';
    const picks = ['1.1.1.1', '2.2.2.2', 'anything'].map((spoof) =>
      clientAddress(withHeaders({ 'x-forwarded-for': `${spoof}, ${real}` })),
    );
    expect(new Set(picks)).toEqual(new Set([real]));
  });

  it('주소가 하나뿐이면 그 주소다 (Vercel처럼 덮어쓰는 프록시)', () => {
    delete process.env.TRUSTED_PROXY_COUNT;
    expect(clientAddress(withHeaders({ 'x-forwarded-for': '198.51.100.3' }))).toBe(
      '198.51.100.3',
    );
  });

  it('CDN 뒤 로드밸런서(2단)면 오른쪽에서 두 번째를 쓴다', () => {
    process.env.TRUSTED_PROXY_COUNT = '2';
    expect(
      clientAddress(
        withHeaders({ 'x-forwarded-for': 'spoofed, 198.51.100.4, 203.0.113.250' }),
      ),
    ).toBe('198.51.100.4');
  });

  it('항목이 신뢰 프록시 수보다 적으면 가장 왼쪽을 쓴다', () => {
    process.env.TRUSTED_PROXY_COUNT = '3';
    expect(clientAddress(withHeaders({ 'x-forwarded-for': '198.51.100.5' }))).toBe(
      '198.51.100.5',
    );
  });

  it('잘못된 설정값은 1로 본다', () => {
    for (const value of ['0', '-1', 'abc', '1.5']) {
      process.env.TRUSTED_PROXY_COUNT = value;
      expect(
        clientAddress(withHeaders({ 'x-forwarded-for': 'spoofed, 198.51.100.6' })),
      ).toBe('198.51.100.6');
    }
  });

  it('공백과 빈 항목을 무시한다', () => {
    delete process.env.TRUSTED_PROXY_COUNT;
    expect(
      clientAddress(withHeaders({ 'x-forwarded-for': ' spoofed ,  , 198.51.100.7 ' })),
    ).toBe('198.51.100.7');
  });

  it('x-forwarded-for가 없으면 x-real-ip, 그것도 없으면 unknown', () => {
    expect(clientAddress(withHeaders({ 'x-real-ip': '198.51.100.8' }))).toBe(
      '198.51.100.8',
    );
    expect(clientAddress(withHeaders({}))).toBe('unknown');
  });
});
