import { ApiError } from '@/lib/api/errors';
import { getDb } from '@/lib/db/sql';
import { hashSubject } from './subject';

/**
 * 레이트 리밋 (11 문서 §3).
 *
 * 비회원 체험 상한(하루 2이닝)은 **게스트 토큰** 단위라 쿠키를 버리고 새로
 * 받으면 무한히 우회된다. 공개 URL에 올리기 전에는 토큰과 무관한 축이
 * 하나 있어야 한다.
 *
 * 고정 윈도 카운터를 Postgres에 둔다. 경계에서 최대 2배까지 통과할 수
 * 있지만, 막으려는 것은 정밀한 제어가 아니라 자동화된 반복 호출이다.
 */

export interface RateLimitRule {
  /** 카운터를 나누는 이름. 엔드포인트마다 따로 센다. */
  bucket: string;
  /** 한 윈도 안에서 허용할 횟수 */
  limit: number;
  /** 윈도 길이(초) */
  windowSeconds: number;
}

/**
 * 경기 시작. 가장 비싼 경로이고 남용 시 문제은행과 DB를 갉아먹는다.
 * 사람이 한 판 하고 결과를 보는 데 1분에 6번이면 넉넉하다.
 */
export const START_SESSION_RULE: RateLimitRule = {
  bucket: 'play.start',
  limit: 6,
  windowSeconds: 60,
};

/**
 * 타석 제출. 정상 플레이도 빠르면 2초에 한 번이라 넉넉히 잡는다.
 * 여기서 막고 싶은 것은 사람이 낼 수 없는 속도다.
 */
export const SUBMIT_AT_BAT_RULE: RateLimitRule = {
  bucket: 'play.submit',
  limit: 120,
  windowSeconds: 60,
};

/** 게스트 기록 승계. 가입 직후 한 번이면 되는 경로다. */
export const CLAIM_GUEST_RULE: RateLimitRule = {
  bucket: 'auth.claim',
  limit: 10,
  windowSeconds: 60,
};

/** 만료된 윈도를 지우는 확률. 전용 스케줄러 없이 테이블을 유지한다. */
const CLEANUP_PROBABILITY = 0.02;
/** 이보다 오래된 윈도는 어떤 규칙에서도 쓰이지 않는다. */
const CLEANUP_AFTER_SECONDS = 3600;

function windowStart(windowSeconds: number, now = Date.now()): Date {
  const size = windowSeconds * 1000;
  return new Date(Math.floor(now / size) * size);
}

/**
 * 앞단에서 `x-forwarded-for`에 주소를 덧붙이는 신뢰 프록시의 수.
 *
 * 배포 구성에 따라 다르므로 환경변수로 받는다(11 문서 §2.2).
 * - 프록시 하나(Vercel, 단일 nginx 등): 1 — 기본값
 * - CDN 뒤에 로드밸런서: 2
 */
function trustedProxyCount(): number {
  const value = Number(process.env.TRUSTED_PROXY_COUNT ?? 1);
  return Number.isInteger(value) && value >= 1 ? value : 1;
}

/**
 * 요청자를 가리키는 값. **IP 원문은 돌려주지 않는다.**
 *
 * `x-forwarded-for`의 **첫 주소를 쓰면 안 된다.** 일반적인 리버스 프록시는
 * 클라이언트가 보낸 헤더 뒤에 실제 주소를 덧붙이므로, 첫 주소는 클라이언트가
 * 마음대로 정할 수 있다. 처음 구현이 그랬고, 요청마다 첫 값만 바꿔 보내자
 * 10번 모두 통과했다.
 *
 * 그래서 **오른쪽에서 신뢰 프록시 수만큼 들어간 자리**를 쓴다. 그 자리는
 * 우리 프록시가 붙인 값이라 위조할 수 없다.
 *
 * 헤더가 없으면 `unknown`으로 묶인다. 이 경우 모든 요청이 한 바구니에
 * 들어가므로 **프록시 뒤에 두는 것이 전제다.**
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const entries = forwarded
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (entries.length > 0) {
      // 항목이 신뢰 프록시 수보다 적으면 구성이 예상과 다르다. 가장 왼쪽을 쓴다.
      const index = Math.max(0, entries.length - trustedProxyCount());
      return entries[index]!;
    }
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * 리밋을 끄는 스위치. **E2E 전용이다.**
 *
 * E2E는 한 주소에서 여러 브라우저 프로젝트를 병렬로 돌려 분당 수십 번 경기를
 * 시작한다. 정확히 `off`일 때만 꺼지고, 깜빡하면 켜진 쪽으로 틀린다.
 */
function rateLimitDisabled(): boolean {
  return process.env.RATE_LIMIT === 'off';
}

/**
 * 한도를 넘었으면 `RATE_LIMITED`(429)를 던진다.
 *
 * 카운터 조작에 실패하면 **통과시킨다.** 이 카운터는 게임과 같은 DB를 쓰므로
 * 여기서 실패했다면 요청 자체도 어차피 실패한다. 리밋 때문에 정상 플레이가
 * 막히는 쪽이 더 나쁘다.
 */
export async function enforceRateLimit(
  request: Request,
  rule: RateLimitRule,
): Promise<void> {
  if (rateLimitDisabled()) return;

  const subject = await hashSubject(clientAddress(request));
  const start = windowStart(rule.windowSeconds);
  const db = getDb();

  let hits: number;
  try {
    const [row] = await db<{ hits: number }[]>`
      insert into public.rate_limit_counters (bucket, subject, window_start, hits)
      values (${rule.bucket}, ${subject}, ${start}, 1)
      on conflict (bucket, subject, window_start)
      do update set hits = public.rate_limit_counters.hits + 1
      returning hits
    `;
    hits = row?.hits ?? 0;
  } catch (error) {
    console.warn(
      `[rate-limit] ${rule.bucket} 카운터 실패, 통과시킴:`,
      error instanceof Error ? error.message : 'unknown',
    );
    return;
  }

  if (Math.random() < CLEANUP_PROBABILITY) {
    void db`
      delete from public.rate_limit_counters
       where window_start < now() - ${`${CLEANUP_AFTER_SECONDS} seconds`}::interval
    `.catch(() => {
      // 청소는 실패해도 요청과 무관하다.
    });
  }

  if (hits > rule.limit) {
    throw new ApiError('RATE_LIMITED');
  }
}
