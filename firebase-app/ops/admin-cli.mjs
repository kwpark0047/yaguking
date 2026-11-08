/**
 * 관리자 운영 작업 실행기(운영자 PC).
 *
 *   node ops/admin-cli.mjs set-admin --project=<id> --email=<이메일> [--remove]   관리자 표시 붙이기/떼기
 *   node ops/admin-cli.mjs sync --project=<id>                                   계정 사본·계정 통계 동기화
 *   node ops/admin-cli.mjs tasks --project=<id>                                  대기 중인 관리자 작업 처리
 *   node ops/admin-cli.mjs daily --project=<id> [--date=YYYY-MM-DD]              하루 통계 요약(기본: 어제, 한국 시간)
 *   node ops/admin-cli.mjs wallet --project=<id>                                  힌트 지갑의 모은 포인트 갱신(시작일 전에는 쓰지 않음)
 *   node ops/admin-cli.mjs official --project=<id> [--pool=<CSV>]                 오늘의 공식전 판정·출제·오래된 것 지우기(풀이 없으면 판정만)
 *   node ops/admin-cli.mjs monthly --project=<id>                                월간 등수 갱신·지난달 확정(docs/engagement-plan.md)
 *   node ops/admin-cli.mjs kbo-review --project=<id> --file=<CSV> --date=YYYY-MM-DD  사람이 쓴 돌아보기 문항을 어제의 퀴즈 초안으로(승인은 관리자 화면)
 *   node ops/admin-cli.mjs kbo-stats --project=<id>                              어제의 KBO 퀴즈 집계·보관 기간 지난 답 지우기
 *   node ops/admin-cli.mjs kbo --project=demo-… --fixture=<JSON> [--date=YYYY-MM-DD]  테스트 데이터로 생성(실제 수집 없음, demo 전용)
 *   node ops/admin-cli.mjs news-feed --project=<id>                              이용 조건을 확인한 언론사 RSS에서 제목·링크·요약 가져오기
 *   node ops/admin-cli.mjs news --project=<id>                                   최신 소식 글마다 출처·날짜 확인 → 통과한 글만 앱에(docs/news.md)
 *
 * 인증은 Application Default Credentials(정리 작업과 같음). `demo-` 프로젝트는 에뮬레이터에서만.
 * 출력에는 개수와 uid 앞자리만 — 이메일은 찍지 않는다(set-admin 확인용 이메일 가림 제외).
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { buildDailyStats, processAdminTasks, setAdmin, syncAccounts } from './admin.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { runMonthly, runWallets } from './monthly.mjs';
import { fixtureAdapter, importReviewSet, runKboPipeline, runKboStats } from './kbo.mjs';
import { runNews, seedNews } from './news.mjs';
import { runNewsFeed } from './newsFeed.mjs';
import { answerWindowMs, bankIds, parsePool, runOfficial } from './official.mjs';

const [command] = process.argv.slice(2);
const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const projectId = arg('project');

if (!['set-admin', 'sync', 'tasks', 'daily', 'official', 'monthly', 'wallet', 'news', 'news-feed', 'kbo', 'kbo-stats', 'kbo-review'].includes(command) || !projectId) {
  console.error('사용법: node ops/admin-cli.mjs <set-admin|sync|tasks|daily|official|monthly|wallet|news> --project=<id> [--email=<이메일>] [--remove] [--date=YYYY-MM-DD]');
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
} else if (command === 'official') {
  // 문항 풀은 운영자 PC에만(정답이 들어 있다 — .gitignore). 출력에는 개수·날짜만(문항·정답은 찍지 않는다)
  const pool = arg('pool');
  if (pool && !existsSync(pool)) console.error(`문항 풀이 없습니다: ${pool} — 판정만 합니다.`);
  const poolText = pool && existsSync(pool) ? readFileSync(pool, 'utf8') : null;
  // 0시 직후에 돌면 어제 공식전의 마지막 답(최대 81초 늦게 들어옴)을 기다렸다 채점한다 — 기다리지 않으면 하루 늦게 채점된다
  const sinceMidnight = (Date.now() + 9 * 3_600_000) % 86_400_000;
  const wait = answerWindowMs() + 10_000 - sinceMidnight;
  if (wait > 0) {
    console.error(`어제 공식전의 마지막 답을 ${Math.ceil(wait / 1000)}초 기다렸다 채점합니다.`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  const report = await runOfficial({ db, poolText });
  console.log(JSON.stringify({ ...report, problems: report.problems.length }));
  for (const problem of report.problems) console.error(`문항 풀: ${problem}`);
  if (report.short.length > 0) console.error(`문항이 모자라 공식전을 만들지 못한 날: ${report.short.join(', ')}`);
} else if (command === 'news') {
  // --seed=<JSON>: 글이 하나도 없을 때만 처음 글을 넣는다(관리자 사이트에서 쓴 글을 덮어쓰지 않는다)
  const seed = arg('seed');
  if (seed) console.log(JSON.stringify(await seedNews({ db, posts: JSON.parse(readFileSync(seed, 'utf8')) })));
  console.log(JSON.stringify(await runNews({ db })));
} else if (command === 'monthly') {
  console.log(JSON.stringify(await runMonthly({ db })));
} else if (command === 'wallet') {
  console.log(JSON.stringify(await runWallets({ db })));
} else if (command === 'news-feed') {
  const report = await runNewsFeed({ db });
  console.log(JSON.stringify({ added: report.added, removed: report.removed, feeds: report.feeds.map((feed) => `${feed.name}:${feed.status}`) }));
} else if (command === 'kbo-review') {
  // 파일은 git 밖(ops/official/*.csv — 정답 포함). 문항 확인은 공식전 풀과 같다. 출력에는 개수만
  const file = arg('file');
  if (!file || !existsSync(file)) {
    console.error('--file=<CSV>가 필요합니다(공식전 풀과 같은 열).');
    process.exit(1);
  }
  const { questions, problems } = parsePool(readFileSync(file, 'utf8'), bankIds());
  for (const problem of problems) console.error(`문항: ${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log(JSON.stringify(await importReviewSet({ db, setId: arg('date'), questions })));
} else if (command === 'kbo-stats') {
  console.log(JSON.stringify(await runKboStats({ db, auth })));
} else if (command === 'kbo') {
  // 이용 권한을 확보하기 전까지 실제 출처 어댑터는 없다. 테스트 데이터는 에뮬레이터에서만 돌린다
  const fixture = arg('fixture');
  if (!projectId.startsWith('demo-') || !fixture) {
    console.error('실제 경기 수집은 없습니다(docs/daily-kbo-quiz/02-data-source-report.md). 테스트 데이터는 --project=demo-… --fixture=<JSON>으로만 돌립니다.');
    process.exit(1);
  }
  const report = await runKboPipeline({ db, adapter: fixtureAdapter(JSON.parse(readFileSync(fixture, 'utf8'))), gamesDate: arg('date') });
  console.log(JSON.stringify(report));
} else if (command === 'sync') {
  console.log(JSON.stringify(await syncAccounts({ auth, db })));
} else {
  console.log(JSON.stringify(await processAdminTasks({ auth, db })));
}
