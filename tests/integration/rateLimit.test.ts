import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { closeDb, getDb } from '@/lib/db/sql';
import {
  enforceRateLimit,
  START_SESSION_RULE,
  type RateLimitRule,
} from '@/server/security/rateLimit';
import { assertLocalDatabase, hasDatabase } from './helpers/fixtures';

/**
 * 레이트 리밋 (11 문서 §3).
 *
 * 비회원 체험 상한은 게스트 토큰 단위라 쿠키를 버리면 우회된다. 이 테스트가
 * 지키는 것은 **토큰과 무관한 축이 실제로 동작한다**는 것이다.
 */

/** 요청자마다 다른 주소를 주어 테스트끼리 카운터를 공유하지 않게 한다. */
function requestFrom(address: string): Request {
  return new Request('http://localhost/api/v1/play/sessions', {
    method: 'POST',
    headers: { 'x-forwarded-for': address },
  });
}

/** 테스트 전용 버킷. 운영 규칙의 숫자에 묶이지 않게 한다. */
function rule(limit: number): RateLimitRule {
  return { bucket: `test.${randomUUID()}`, limit, windowSeconds: 60 };
}

async function cleanupBuckets() {
  const db = getDb();
  await db`delete from public.rate_limit_counters where bucket like 'test.%'`;
}

describe.skipIf(!hasDatabase())('레이트 리밋', () => {
  beforeAll(() => {
    assertLocalDatabase();
    // 서명 키가 없으면 주소 해시를 만들 수 없다.
    process.env.GUEST_TOKEN_SECRET ??= 'x'.repeat(48);
  });

  afterAll(async () => {
    await cleanupBuckets();
    await closeDb();
  });

  it('한도까지는 통과하고 넘으면 429를 던진다', async () => {
    const limited = rule(3);
    const request = requestFrom('203.0.113.10');

    for (let i = 0; i < 3; i += 1) {
      await expect(enforceRateLimit(request, limited)).resolves.toBeUndefined();
    }

    await expect(enforceRateLimit(request, limited)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  it('429의 상태 코드는 429다', async () => {
    const limited = rule(1);
    const request = requestFrom('203.0.113.11');
    await enforceRateLimit(request, limited);

    const error = await enforceRateLimit(request, limited).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
  });

  it('주소가 다르면 카운터를 공유하지 않는다', async () => {
    const limited = rule(1);
    await enforceRateLimit(requestFrom('203.0.113.20'), limited);

    // 다른 주소는 자기 몫을 그대로 쓴다.
    await expect(
      enforceRateLimit(requestFrom('203.0.113.21'), limited),
    ).resolves.toBeUndefined();
  });

  it('버킷이 다르면 카운터를 공유하지 않는다', async () => {
    const request = requestFrom('203.0.113.30');
    const first = rule(1);
    const second = rule(1);

    await enforceRateLimit(request, first);
    await expect(enforceRateLimit(request, second)).resolves.toBeUndefined();
    await expect(enforceRateLimit(request, first)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });

  /** IP 원문이 남으면 개인정보가 늘어난다 (11 문서 §2.1). */
  it('IP 원문을 저장하지 않는다', async () => {
    const address = '203.0.113.99';
    const limited = rule(5);
    await enforceRateLimit(requestFrom(address), limited);

    const db = getDb();
    const rows = await db<{ subject: string }[]>`
      select subject from public.rate_limit_counters where bucket = ${limited.bucket}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.subject).not.toContain(address);
    // HMAC-SHA256 16진 표기
    expect(rows[0]!.subject).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * 회귀 방지. 처음 구현은 x-forwarded-for의 **첫** 주소를 썼다. 프록시는
   * 클라이언트가 보낸 헤더 뒤에 실제 주소를 덧붙이므로, 첫 값만 바꿔 보내면
   * 요청마다 새 카운터가 생겨 10번 모두 통과했다.
   */
  it('클라이언트가 앞쪽 주소를 바꿔 보내도 같은 카운터로 센다', async () => {
    const limited = rule(2);
    const realAddress = '198.51.100.200';

    for (let i = 0; i < 2; i += 1) {
      await enforceRateLimit(
        new Request('http://localhost/', {
          headers: { 'x-forwarded-for': `10.9.9.${i}, ${realAddress}` },
        }),
        limited,
      );
    }

    await expect(
      enforceRateLimit(
        new Request('http://localhost/', {
          headers: { 'x-forwarded-for': `10.9.9.99, ${realAddress}` },
        }),
        limited,
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('RATE_LIMIT=off면 세지 않는다 (E2E 전용)', async () => {
    const limited = rule(1);
    const request = requestFrom('203.0.113.50');
    const original = process.env.RATE_LIMIT;
    process.env.RATE_LIMIT = 'off';
    try {
      for (let i = 0; i < 5; i += 1) {
        await expect(enforceRateLimit(request, limited)).resolves.toBeUndefined();
      }
    } finally {
      if (original === undefined) delete process.env.RATE_LIMIT;
      else process.env.RATE_LIMIT = original;
    }

    const db = getDb();
    const rows = await db`
      select 1 from public.rate_limit_counters where bucket = ${limited.bucket}
    `;
    expect(rows).toHaveLength(0);
  });

  it('운영 규칙은 한 사람이 정상적으로 플레이할 여유를 남긴다', () => {
    // 한 판 하고 결과를 보는 흐름이 1분 안에 막히면 안 된다.
    expect(START_SESSION_RULE.limit).toBeGreaterThanOrEqual(3);
    expect(START_SESSION_RULE.windowSeconds).toBeLessThanOrEqual(60);
  });
});
