/**
 * 부하 스모크 (09 문서 §7.5).
 *
 * 가상 사용자 N명이 동시에 체험 1이닝을 돌며 **타석 제출 지연**을 잰다.
 * 타석 제출은 DB 트랜잭션(세션 잠금 → 판정 → 원장 → 상태)을 거치므로
 * 이 경로가 가장 무겁다. 목표는 p95 300ms (08 문서 §6.8).
 *
 * 각 가상 사용자는 쿠키 없이 시작해 서버가 발급한 게스트 쿠키를 받아 쓴다.
 * 즉 사용자마다 별도 게스트 세션이라 체험 상한에 걸리지 않는다.
 *
 * 사용:
 *   node scripts/load-smoke.mjs                       # 50명, http://localhost:3100
 *   node scripts/load-smoke.mjs --users 20 --base http://localhost:3000
 *
 * 주의: **프로덕션 빌드(next start)에 대고 재야 의미가 있다.** dev 서버는
 * 요청마다 컴파일이 섞여 수치가 왜곡된다.
 */

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const BASE = arg('base', 'http://localhost:3100');
const USERS = Number(arg('users', '50'));
const MAX_AT_BATS = 20;

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarize(label, values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, v) => sum + v, 0) / (sorted.length || 1);
  return {
    label,
    n: sorted.length,
    min: Math.round(sorted[0] ?? 0),
    mean: Math.round(mean),
    p50: Math.round(percentile(sorted, 50)),
    p95: Math.round(percentile(sorted, 95)),
    p99: Math.round(percentile(sorted, 99)),
    max: Math.round(sorted.at(-1) ?? 0),
  };
}

async function runUser() {
  const atBatMs = [];
  const errors = [];

  const startedAt = performance.now();
  const createResponse = await fetch(`${BASE}/api/v1/play/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'trial' }),
  });
  const createMs = performance.now() - startedAt;

  const cookie = createResponse.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

  const created = await createResponse.json();
  if (!created.success) {
    return { createMs, atBatMs, errors: [created.error.code] };
  }

  const sessionId = created.data.sessionId;
  let atBat = created.data.atBat;

  for (let i = 0; i < MAX_AT_BATS && atBat; i += 1) {
    const body = JSON.stringify({
      sequence: atBat.sequence,
      optionId: atBat.options[0].id,
      submissionId: crypto.randomUUID(),
    });

    const t0 = performance.now();
    const response = await fetch(
      `${BASE}/api/v1/play/sessions/${sessionId}/at-bats`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body,
      },
    );
    atBatMs.push(performance.now() - t0);

    const result = await response.json();
    if (!result.success) {
      // 마감 초과는 서버가 이미 아웃으로 확정했고 다음 타석이 detail 에 있다.
      if (result.error.code === 'ANSWER_DEADLINE_EXCEEDED') {
        const detail = result.error.detail;
        if (detail?.finished) break;
        atBat = detail?.next ?? null;
        continue;
      }
      errors.push(result.error.code);
      break;
    }

    if (result.data.finished) break;
    atBat = result.data.next;
  }

  return { createMs, atBatMs, errors };
}

async function main() {
  console.log(`대상 ${BASE} · 동시 사용자 ${USERS}명`);

  const wallStart = performance.now();
  const results = await Promise.all(Array.from({ length: USERS }, () => runUser()));
  const wallMs = performance.now() - wallStart;

  const createMs = results.map((r) => r.createMs);
  const atBatMs = results.flatMap((r) => r.atBatMs);
  const errors = results.flatMap((r) => r.errors);

  const rows = [
    summarize('경기 시작 POST /play/sessions', createMs),
    summarize('타석 제출 POST /at-bats', atBatMs),
  ];

  console.log('');
  console.log('지표                              n     min   mean    p50    p95    p99    max');
  for (const row of rows) {
    console.log(
      `${row.label.padEnd(33)} ${String(row.n).padStart(4)} ${String(row.min).padStart(6)}` +
        ` ${String(row.mean).padStart(6)} ${String(row.p50).padStart(6)}` +
        ` ${String(row.p95).padStart(6)} ${String(row.p99).padStart(6)}` +
        ` ${String(row.max).padStart(6)}  (ms)`,
    );
  }

  console.log('');
  console.log(`총 소요 ${Math.round(wallMs)}ms · 타석 ${atBatMs.length}건`);

  if (errors.length > 0) {
    const counted = errors.reduce((acc, code) => {
      acc[code] = (acc[code] ?? 0) + 1;
      return acc;
    }, {});
    console.log('오류:', JSON.stringify(counted));
  } else {
    console.log('오류 없음');
  }

  const atBatP95 = rows[1].p95;
  console.log('');
  console.log(`타석 제출 p95 목표 300ms → 실측 ${atBatP95}ms ${atBatP95 <= 300 ? '(충족)' : '(미달)'}`);
}

await main();
