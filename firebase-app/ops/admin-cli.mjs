/**
 * 관리자 운영 작업 실행기(운영자 PC).
 *
 *   node ops/admin-cli.mjs set-admin --project=<id> --email=<이메일> [--remove]   관리자 표시 붙이기/떼기
 *   node ops/admin-cli.mjs sync --project=<id>                                   계정 사본·계정 통계 동기화
 *   node ops/admin-cli.mjs tasks --project=<id>                                  대기 중인 관리자 작업 처리
 *   node ops/admin-cli.mjs daily --project=<id> [--date=YYYY-MM-DD]              하루 통계 요약(기본: 어제, 한국 시간)
 *   node ops/admin-cli.mjs monthly --project=<id>                                월간 등수 갱신·지난달 확정(docs/engagement-plan.md)
 *
 * 인증은 Application Default Credentials(정리 작업과 같음). `demo-` 프로젝트는 에뮬레이터에서만.
 * 출력에는 개수와 uid 앞자리만 — 이메일은 찍지 않는다(set-admin 확인용 이메일 가림 제외).
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { buildDailyStats, processAdminTasks, setAdmin, syncAccounts } from './admin.mjs';
import { runMonthly } from './monthly.mjs';

const [command] = process.argv.slice(2);
const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const projectId = arg('project');

if (!['set-admin', 'sync', 'tasks', 'daily', 'monthly'].includes(command) || !projectId) {
  console.error('사용법: node ops/admin-cli.mjs <set-admin|sync|tasks|daily|monthly> --project=<id> [--email=<이메일>] [--remove] [--date=YYYY-MM-DD]');
  process.exit(1);
}
const onEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
if (projectId.startsWith('demo-') !== onEmulator) {
  console.error('demo- 프로젝트는 에뮬레이터에서만, 실제 프로젝트는 에뮬레이터 밖에서만 돌립니다.');
  process.exit(1);
}

const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);

if (command === 'set-admin') {
  const email = arg('email');
  if (!email) {
    console.error('--email=<이메일>이 필요합니다.');
    process.exit(1);
  }
  const result = await setAdmin({ auth, email, value: !process.argv.includes('--remove') });
  const masked = email.replace(/^(.{2}).*(@.*)$/, '$1***$2');
  console.log(`${masked}: 관리자 표시 ${result.admin ? '붙임' : '뗌'} (uid ${result.uid.slice(0, 6)}…, 로그인 수단 ${result.providers.join(',') || '없음'})`);
  if (result.admin && !result.providers.includes('google.com')) {
    console.log('주의: 관리자 화면은 구글로 로그인한 세션만 관리자로 본다. 이 계정에 구글 로그인을 연결하세요.');
  }
  console.log('표시는 다음 로그인(또는 토큰 새로 받기)부터 적용됩니다.');
} else if (command === 'daily') {
  const day = arg('date');
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    console.error('--date=YYYY-MM-DD');
    process.exit(1);
  }
  console.log(JSON.stringify(await buildDailyStats({ db, day })));
} else if (command === 'monthly') {
  console.log(JSON.stringify(await runMonthly({ db })));
} else if (command === 'sync') {
  console.log(JSON.stringify(await syncAccounts({ auth, db })));
} else {
  console.log(JSON.stringify(await processAdminTasks({ auth, db })));
}
