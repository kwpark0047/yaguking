# 배포 안내 (8단계, 2026-10-26 · 2026-10-27 갱신)

> **실제 사이트 운영 중**(프로젝트 `yaguking-bc25c`, 배포 기록은 `docs/deploy-log.md`, 사이트 주소는 §9). §1~3은 처음
> 배포할 때 쓴 절차로 남겨 둔다. **실제 배포(미리보기 포함)는 운영자 승인 뒤에만** 한다.
> 무료 원칙: Firebase **Spark**(결제 계정 연결 안 함), Cloud Functions·Blaze 없음, GitHub 무료 분량 안.

## 0. 준비된 것

| 무엇 | 어디 | 상태 |
|---|---|---|
| Hosting 설정(SPA 주소, 캐시, 보안 헤더) | `firebase.json` | 준비됨 |
| 배포 직전 자동 점검 | `scripts/predeploy-check.mjs` (`firebase.json` predeploy) | 준비됨 — 걸리면 배포가 멈춘다 |
| 정리 작업(방·자리·오래된 비회원) | `ops/cleanup.mjs`, `ops/cleanup-cli.mjs` | 준비됨 — 기본은 미리 보기 |
| CI(검사만) | `.github/workflows/firebase-app-ci.yml` | 원격 저장소가 생기면 PR·main에서 돈다 |
| 자동 배포 | `.github/workflows/firebase-deploy.yml` | **꺼짐**(손으로만 + 저장소 변수 + 승인) |
| 예약 정리 | `.github/workflows/firebase-cleanup.yml` | **꺼짐**(예약 주석 + 저장소 변수) |

배포 직전 점검이 막는 것: `demo-` 프로젝트, 빈 설정값, 앱 설정과 배포 대상이 다른 프로젝트, 에뮬레이터용 빌드
(에뮬레이터 주소·데모 설정이 남은 것), 개인 키·서비스 계정·소스맵·공식 정답이 섞인 결과물.

## 1. 한 번만 — Firebase 프로젝트 만들기 (콘솔, 사용자)

1. [Firebase 콘솔](https://console.firebase.google.com) › 프로젝트 추가. Google Analytics는 **끈다**(수집 항목이 늘어 처리방침이 바뀐다)
2. 요금제가 **Spark**인지 확인. **결제 계정을 연결하지 않는다**
3. Firestore 데이터베이스 만들기: **Standard** 판, 위치 **`asia-northeast3`(서울)** — 나중에 못 바꾼다. 운영 모드로 시작(규칙은 배포로 덮는다)
4. Authentication › 로그인 방법: **이메일/비밀번호**, **Google**, **익명** 사용 설정. 이메일 링크는 쓰지 않는다(하루 5통)
5. 프로젝트 설정 › 내 앱 › 웹 앱 추가(Hosting 함께 설정은 체크 안 해도 됨) → 나온 값을 `firebase-app/.env.production.local`에:

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=<프로젝트ID>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<프로젝트ID>
   VITE_FIREBASE_APP_ID=...
   VITE_USE_EMULATORS=false
   ```

   이 파일은 커밋되지 않는다(`.gitignore`). 웹 앱 설정값은 비밀은 아니지만 프로젝트마다 다르다
6. 이 PC에서 CLI 연결(실행만, 배포 아님):

   ```bash
   npx firebase login
   ```

   ```bash
   npx firebase use --add
   ```

   별칭은 `prod`로. 기본(`default`)은 `demo-yaguking`으로 남겨 둔다 — 실수로 `--project` 없이 배포하면 점검이 막는다

## 2. 배포 전 로컬 확인

`firebase-app`에서 차례로(전부 통과해야 한다):

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run test:rules
```

```bash
npm run test:ops
```

```bash
npm run test:e2e
```

배포 점검만 따로(빌드 + 결과물 검사, 배포하지 않음) — PowerShell이면 `$env:GCLOUD_PROJECT="<프로젝트ID>"` 뒤에 실행:

```bash
GCLOUD_PROJECT=<프로젝트ID> npm run deploy:check
```

## 3. 첫 배포 — 승인 뒤, 사용자가 직접

순서: **보안 규칙 → 미리보기 → 확인 → 실제 사이트.** 미리보기도 Firestore는 실제 데이터베이스를 쓰므로 규칙이 먼저다
(규칙이 없으면 운영 모드 기본값이 모든 읽기·쓰기를 막아 화면이 오류를 낸다).

1. 보안 규칙·색인:

   ```bash
   npx firebase deploy --only firestore --project prod
   ```

2. 미리보기(7일 뒤 저절로 사라지는 주소, Spark에서 무료):

   ```bash
   npx firebase hosting:channel:deploy preview --expires 7d --project prod
   ```

3. 미리보기 주소에서 확인할 것
   - 가입(이메일·구글)·로그인·비회원·만 14세 확인·프로필·개인 경기·레벨 테스트·오답노트·친구 대결(브라우저 두 개)
   - 구글 로그인이 "승인되지 않은 도메인"이면 Authentication › 설정 › 승인된 도메인에 미리보기 주소를 잠깐 넣고, 확인 뒤 지운다
   - 브라우저 개발자 도구 콘솔에 **CSP 위반 보고**(Report-Only)가 없는지 — 있으면 `firebase.json`의 CSP를 고친다
   - 헤더: `curl -I <주소>/` 는 `cache-control: no-cache`, `curl -I <주소>/assets/<파일>.js` 는 `max-age=31536000, immutable`
     (같은 헤더가 겹치면 **뒤 규칙이 이긴다**는 동작에 기대고 있다. 로컬 Hosting 에뮬레이터는 사용자 헤더를 붙이지 않아
     여기서만 확인할 수 있다)
4. 실제 사이트(`<프로젝트ID>.web.app`):

   ```bash
   npx firebase deploy --only hosting --project prod
   ```

   배포 직전에 점검이 저절로 돈다(운영 빌드 + 결과물 검사)

**되돌리기**: Hosting은 콘솔 › Hosting › 출시 기록에서 이전 판 "롤백". 규칙은 콘솔 › Firestore › 규칙 › 기록에서 이전 판.

## 4. 출시할 때 바꿀 것

- `firebase.json`의 `X-Robots-Tag: noindex` 지우기(지금은 검색에 안 나오게 막아 둠)
- CSP를 `Content-Security-Policy-Report-Only` → `Content-Security-Policy`로(미리보기에서 위반이 없을 때)
- 이용약관·개인정보처리방침 Firebase판 문안(9단계)
- App Check 도입 여부(비회원 우회 방지, 무료 월 1만 건 — `docs/usage-report.md` §4)

## 5. GitHub 자동 배포 켜기 (선택, 승인 뒤)

원격 저장소가 필요하다. **비공개 권장**(Actions 월 2,000분 무료 — 이 프로젝트 사용량 추정 월 수백 분).
GitHub 결제 예산은 **$0** 그대로 두면 넘쳐도 청구되지 않고 멈춘다.

1. Google Cloud(같은 프로젝트)에서 **키 파일 없는 인증**(Workload Identity Federation) — Cloud Shell에서:

   ```bash
   gcloud services enable iamcredentials.googleapis.com sts.googleapis.com --project=<프로젝트ID>
   ```

   ```bash
   gcloud iam workload-identity-pools create github --project=<프로젝트ID> --location=global --display-name=GitHub
   ```

   ```bash
   gcloud iam workload-identity-pools providers create-oidc github --project=<프로젝트ID> --location=global --workload-identity-pool=github --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" --attribute-condition="assertion.repository=='<소유자>/<저장소>'"
   ```

2. 배포용 서비스 계정(역할: Firebase Hosting 관리자, Firebase Rules 관리자, Cloud Datastore 색인 관리자,
   Service Usage 소비자)을 만들고, 위 저장소만 이 계정을 쓸 수 있게 묶는다:

   ```bash
   gcloud iam service-accounts add-iam-policy-binding yaguking-deploy@<프로젝트ID>.iam.gserviceaccount.com --role=roles/iam.workloadIdentityUser --member="principalSet://iam.googleapis.com/projects/<프로젝트번호>/locations/global/workloadIdentityPools/github/attribute.repository/<소유자>/<저장소>"
   ```

3. GitHub 저장소 › Settings
   - Environments: `production`(필수 검토자 = 본인), `preview`
   - Variables(비밀 아님): `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_APP_ID`,
     `GCP_WIF_PROVIDER`(`projects/<번호>/locations/global/workloadIdentityPools/github/providers/github`),
     `DEPLOY_SERVICE_ACCOUNT`
   - 마지막에 `FIREBASE_DEPLOY_ENABLED` = `true` — 이 값이 없으면 워크플로가 눌려도 건너뛴다
4. Actions › "Firebase판 배포 (꺼짐)" › Run workflow › `preview` 먼저. `live`는 production 승인을 거친다

워크플로는 배포 전에 타입·단위·보안 규칙 테스트와 배포 점검을 다시 돈다. push로는 절대 배포되지 않는다.

## 6. 정리 작업 켜기 (선택, 승인 뒤)

> **2026-10-26: 운영자 PC 예약 작업으로 켬**(`ops/run-cleanup.cmd`, `ops/yaguking-cleanup-task.xml`, `docs/deploy-log.md` 3차 배포). 아래 GitHub 방법은 쓰지 않는다 — 쓰게 되면 처리방침에 GitHub 위탁·국외 이전을 넣는다.

지우는 것: 만든 지 24시간 지난 대결 방과 자리, 방장이 닫아 주인 없이 남은 자리, **30일** 쓰지 않은 비회원 계정과 그 기록
(기존 처리방침의 비회원 보관 기간). 회원은 건드리지 않는다. 한 번에 최대 5,000문서(무료 삭제 한도 하루 2만).

1. 먼저 이 PC에서 **미리 보기**(아무것도 지우지 않음):

   ```bash
   gcloud auth application-default login
   ```

   ```bash
   npm run ops:cleanup -- --project=<프로젝트ID>
   ```

2. 숫자가 맞으면 `--apply`로 한 번 실제로. 콘솔에서 결과 확인
3. GitHub에서 쓰려면: 정리용 서비스 계정(역할: Cloud Datastore 사용자, Firebase Authentication 관리자)을 2번과 같은 방식으로
   묶고, 변수 `CLEANUP_SERVICE_ACCOUNT`, `FIREBASE_CLEANUP_ENABLED=true`. 손으로 미리 보기 → 실제 → 그다음
   `firebase-cleanup.yml`의 `schedule` 주석을 푼다(매일 KST 03:30)
4. 저장소에 60일 동안 활동이 없으면 GitHub가 예약 작업을 끌 수 있다 — 운영 점검표에 넣는다

## 7. 무료 유지 점검표 (주 1회)

- Firebase 콘솔 › 사용량: Firestore 읽기·쓰기·삭제, Hosting 전송량이 하루 한도(`docs/usage-report.md`)의 몇 %인지
- 결제 계정이 연결되지 않았는지(프로젝트 설정 › 사용량 및 결제 = Spark)
- GitHub › Settings › Billing: Actions 사용 분, 예산 $0
- 정리 작업 결과(`stoppedAtLimit`가 true면 지울 것이 한도보다 많다 — 횟수를 늘리거나 상한 조정)

## 8. 관리자 사이트(1차) 배포 — 승인 뒤, 순서대로

관리자 1차(골격·공지·가입자·가입 확인, `docs/admin-plan.md`)는 **로컬 검증까지** 했다. 올리는 순서:

1. **처리방침 개정 공지**(시행 7일 전): 관리자 열람·접속기록(2년 보관 — 법정 1년 이상)·운영 관리 목적을 처리방침에 넣는다. 공지 기능이
   관리자 사이트 안에 있으므로, 처음 한 번은 관리자 사이트를 올린 뒤 바로 공지를 올리고 7일 뒤부터 회원 열람을 쓴다
2. 관리자 사이트 만들기(한 번): 

   ```bash
   npx.cmd firebase hosting:sites:create yaguking-bc25c-admin --project prod
   ```

3. 콘솔 › Authentication › 설정 › 승인된 도메인에 `yaguking-bc25c-admin.web.app` 추가(구글 로그인 팝업용)
4. 보안 규칙·색인(관리자 규칙, 경기 묶음 색인): `npx.cmd firebase deploy --only firestore --project prod`
5. 관리자 사이트 미리보기 → 확인(구글 로그인, **강제 CSP**에서 콘솔 오류 없는지) → 실제:

   ```bash
   npx.cmd firebase hosting:channel:deploy preview --only admin --expires 7d --project prod
   ```

   ```bash
   npx.cmd firebase deploy --only hosting:admin --project prod
   ```

6. 관리자 표시 붙이기 — kwpark0047@gmail.com이 **관리자 사이트에서 구글로 한 번 로그인한 뒤**(계정이 있어야 함):

   ```bash
   npm run ops:admin -- set-admin --project=yaguking-bc25c --email=kwpark0047@gmail.com
   ```

   관리자 사이트에서 "다시 확인"
7. 계정 사본 첫 동기화: `npm run ops:admin -- sync --project=yaguking-bc25c`. 매일 하려면 `ops/run-cleanup.cmd`에
   `node ops\admin-cli.mjs tasks --project=yaguking-bc25c`(대기 작업)과 `sync`를 덧붙인다(예약 작업은 그대로)
8. 이용자 앱 다시 배포(공지 띠·공지 목록): `npx.cmd firebase deploy --only hosting:app --project prod`

이제 `--only hosting`은 세 사이트를 모두 올린다. 하나만 올리려면 `hosting:app`·`hosting:admin`·`hosting:legacy`.

## 9. 사이트 주소(2026-10-27부터)

| 대상(`firebase.json` target) | Hosting 사이트 | 주소 | 하는 일 |
|---|---|---|---|
| `app` | `yaguking` | https://yaguking.web.app | 이용자 앱 |
| `admin` | `yaguking-bc25c-admin` | https://yaguking-bc25c-admin.web.app | 관리자 사이트 |
| `legacy` | `yaguking-bc25c`(프로젝트 기본 사이트) | yaguking-bc25c.web.app·.firebaseapp.com | 경로·검색어 그대로 새 주소로 301 |

- 기본 사이트는 지울 수 없고, 그 `firebaseapp.com`이 **구글 로그인 팝업**(`/__/auth/handler`, 설정의 authDomain)을 맡는다.
  그래서 넘기기 규칙은 `/__/`로 시작하는 주소를 빼고 넘긴다(`^/(?P<path>[^_].*)?$`). 이것까지 넘기면 두 사이트 모두
  구글 로그인이 깨진다(단위 테스트 `deploy.test.ts`가 지킴)
- 새 주소를 쓰려면 승인된 도메인에 넣어야 구글 로그인이 된다(`yaguking.web.app` 추가함)
- 기기 저장소·로그인 상태는 주소(출처)마다 따로다. 예전 주소에서 비회원으로 하던 사람은 새 주소에서 새 비회원으로 시작한다
  (바꾼 날 실제 계정은 시험용 익명 3개·운영자 구글 1개뿐이라 영향 없음). 회원은 새 주소에서 다시 로그인하면 된다
- 짧은 주소를 다른 이름으로 바꾸려면: `npx.cmd firebase hosting:sites:create <이름> --project prod` → `.firebaserc`의 `app`
  대상을 그 사이트로 → 승인된 도메인 추가 → `hosting:app` 배포 → `legacy`의 넘길 주소를 바꿔 `hosting:legacy` 배포

## 10. 출석·월간 등수·오늘의 공식전 운영(2026-10-29부터)

`docs/engagement-plan.md`. 코드는 배포돼 있어도 **2026-11-05(처리방침 개정 시행일) 전에는 화면이 "곧 시작" 안내만** 보인다.

| 할 일 | 언제 | 어떻게 |
|---|---|---|
| 공식전 문항 풀 만들기 | **11-03까지**(첫 공식전은 11-04 03:30 작업이 만든다) | `ops/official/pool.csv` — 열은 `ops/official/pool.example.csv`와 같다(앱 문제은행 CSV와 같은 열). 하루 5문항, 주 35문항. **정답이 들어 있어 저장소에 올리지 않는다**(.gitignore) |
| 풀 확인 | 문항을 더할 때마다 | 실제 프로젝트에서 `node ops\admin-cli.mjs official --project=yaguking-bc25c --pool=ops\official\pool.csv` — 출력의 `remaining`(남은 문항)·`problems`(거절한 줄 수, 이유는 바로 아래 줄). 앱 문제은행에 있는 문항·빠진 칸·잘못된 정답은 거절 |
| 매일 작업 | 매일 03:30(예약 작업 그대로) | `ops/run-cleanup.cmd`: … 하루 요약 → **공식전(채점·출제·40일 지난 것 삭제)** → **월간 등수(어제까지, 1일에 지난달 확정·칭호)**. 풀 파일이 없으면 공식전은 채점만 한다 |
| 공지 | 시행 7일 전(10-29 배포 = 11-05 시행) | 처리방침 화면에 "개정 예고"가 자동으로 뜬다. 관리자 사이트 공지로도 알리면 좋다 |

- 문항이 모자라면 그날 공식전은 만들지 않는다(화면 "준비 중"). 남은 문항 수는 `adminStats/official`(`daysLeft` = 며칠 치)
- 운영자 PC가 꺼진 날은 다음 실행이 따라잡는다: 채점은 닫힌 공식전 전부, 등수는 처음부터 다시 계산. 공식전은 그날 작업이 못 돌면
  다음 날 아침에야 만들어진다(내일 것을 하루 먼저 만들어 두므로 보통은 문제없음)
- 등수·칭호·공식 점수는 운영자 PC 작업(Admin SDK)만 쓴다 — 기기가 계산한 연습 점수는 등수에 넣지 않는다
