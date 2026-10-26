/**
 * 정리 작업 실행기.
 *
 *   node ops/cleanup-cli.mjs --project=<id>            미리 보기(아무것도 지우지 않음)
 *   node ops/cleanup-cli.mjs --project=<id> --apply    실제로 지운다
 *   --max-deletes=<n>                                   이번에 지울 문서 상한(기본 5000)
 *
 * 인증은 Application Default Credentials — GitHub Actions에서는 Workload Identity Federation,
 * 운영자 PC에서는 `gcloud auth application-default login`. 키 파일을 저장소에 두지 않는다.
 * `demo-` 프로젝트는 에뮬레이터(FIRESTORE_EMULATOR_HOST·FIREBASE_AUTH_EMULATOR_HOST)에서만 돈다.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_MAX_DELETES, cleanup } from './cleanup.mjs';

const arg = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.split('=')[1];
const projectId = arg('project');
const apply = process.argv.includes('--apply');
const maxDeletes = Number(arg('max-deletes') ?? DEFAULT_MAX_DELETES);

if (!projectId) {
  console.error('--project=<프로젝트 ID>가 필요합니다.');
  process.exit(1);
}
const onEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
if (projectId.startsWith('demo-') !== onEmulator) {
  console.error('demo- 프로젝트는 에뮬레이터에서만, 실제 프로젝트는 에뮬레이터 밖에서만 돌립니다.');
  process.exit(1);
}
if (!Number.isInteger(maxDeletes) || maxDeletes < 1 || maxDeletes > 20000) {
  console.error('--max-deletes는 1~20000이어야 합니다(무료 삭제 한도 하루 2만).');
  process.exit(1);
}

const app = initializeApp({ projectId });
const report = await cleanup({
  db: getFirestore(app),
  auth: getAuth(app),
  dryRun: !apply,
  maxDeletes,
  log: (line) => console.log(`  ${line}`),
});
console.log(JSON.stringify(report));
if (!apply) console.log('미리 보기였습니다. 지우려면 --apply');
