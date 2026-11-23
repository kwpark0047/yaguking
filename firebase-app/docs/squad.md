# 팀(2단계)·팀 플레이(3단계)·보호자 동의

> 상태: **구현(2026-11-23), 시행 2026-12-15**. 기획: Claude 문서 "야구왕 친구 초대·팀 플레이 기획" §4~§7.
> 운영자 결정: 2026-11-18(팀 2~9명, 자녀 동의 절차, 등급분류 변경 신고 불필요) · 2026-11-23(자녀 별도 계정 + 보호자 메일 동의, 팀과 팀 플레이 같은 날 12-15).
> 코드에서는 KBO 구단(`teams.ts`, `favoriteTeams`)과 헷갈리지 않게 **squad**, 화면에서는 **팀**.

## 무엇을

| 항목 | 내용 | 코드 |
|---|---|---|
| 팀 | 회원 2~9명, 친구팀·동료팀·가족팀(종류는 이름표 — 확인하지 않음, 바꿀 수 없음). 한 사람 한 팀 | `src/lib/squad/squad.ts` |
| 역할 | 감독(만든 사람): 이름·로고 바꾸기, 승인, 내보내기, 코치 정하기, 감독 넘기기. 코치(1명): 승인만. 감독이 나가면 먼저 들어온 어른 팀원에게 | `squadApi.ts`, `SquadPage.tsx` |
| 합류 | 팀 코드(6자리)나 팀 링크(`/team?join=코드`) → 신청 → 감독·코치 승인. 나간 뒤 7일 동안 다른 팀 못 감 | `requestJoin`, `approveRequest` |
| 팀 이름 | 2~12자. 화면이 실제 구단 이름·별칭(예: ‘LG 트윈스’, ‘이글스’)과 비속어를 거르고, 거르지 못한 이름은 운영자가 숨긴다 | `squadNameProblem`, `admin-cli squad-hide` |
| 로고 | 틀 6 · 상징 12(그림 6 + 동물 6) · 주색 12 · 보조색(주색과 3:1 이상 대비만) · 이니셜(영문·숫자 1~3자 또는 한글 한 글자). 설정값만 저장하고 기기가 SVG로 그린다 | `SquadLogo.tsx`, `LogoEditor.tsx` |
| 팀 주간 리그 | 월~일, 팀원이 푼 **오늘의 공식전 점수**(운영자 PC 채점) → 팀 점수 = 상위 5명 평균. 참가한 팀만 순위. 월요일 0시에 확정: 1~3위 팀의 그 주 참가 팀원에게 보너스 30·20·10P(힌트에만, 월간 등수 제외) + 로고 별 배지 | `ops/squad.mjs`, `SquadLeaguePage.tsx` |
| 팀 대항전 | 친구 대결 방의 팀 모드(`/room?team=1`). 두 팀이 팀당 5명까지, 팀 점수 = 낸 사람 점수의 평균. 비공식(보상·리그 없음) | `RoomLobbyPage.tsx`, `RoomPage.tsx`, `room/api.ts` |
| 만 14세 미만 | 자녀가 별도 계정으로 가입 → 보호자 메일 주소 → 보호자가 그 주소에서 동의 메일 → 운영자 확인 뒤 열림. 7일 안에 동의 없으면 삭제. 가족팀만(감독·코치 불가), 월간 등수 익명, 초대 코드 없음 | `src/lib/auth/guardian.ts`, `GuardianPage.tsx`, `ops/guardian.mjs` |

## 저장

| 위치 | 쓰는 쪽 |
|---|---|
| `squads/{코드}` {name, kind, logo, captain, coach, size, op, hidden?, badge?} | 감독·팀원(규칙이 묶음의 짝을 확인). `hidden`·`badge`는 운영자 PC만 |
| `squads/{코드}/members/{uid}` {nickname, joinedAt, child} | 만들기·승인·나가기 묶음. 팀원끼리만 읽음 |
| `squads/{코드}/requests/{uid}` {nickname, child, requestedAt} | 본인(내 팀 코드와 한 묶음). 본인·감독·코치가 읽고 지움 |
| `squads/{코드}/weeks/{월요일}` {score, rank, members[닉네임·점수·푼 날]} | 운영자 PC. 팀원이 읽음 |
| `squadLeague/{월요일}` {squads 상위 50, count, through, final} | 운영자 PC. 확인된 회원이 읽음(10분 기억) |
| `users/{uid}`의 `squad`·`squadLeftAt` | 본인 — 규칙: 앞 팀 자리가 없어야 바꿈, 새 팀은 같은 묶음에서 자리·신청서가 생길 때, 나가면 서버 시각, 7일 |
| `users/{uid}/meta/squads` {weeks, bonus} | 운영자 PC(주마다 기록 — 다시 돌려도 같다). 지갑 작업이 더한다 |
| `users/{uid}`의 `under14At` / `guardianConsentAt`·`guardianConsentVersion` | 자녀 본인(응답 시각) / 운영자 PC만(동의) |
| `users/{uid}/private/guardian` {email, code, requestedAt, consentedAt?} | 자녀 본인(한 번 만들기). 본인·관리자만 읽음 |
| `rooms/{코드}`의 `teamMatch`·`squads`, 자리의 `squad` | 방장(내 팀)·참가자(내 팀, 둘째 팀은 끝에) |

## 운영

- 0시 작업 순서: … `invites` → **`squads`** → **`guardians-expire`** → `wallet` (`ops/run-cleanup.cmd`). 시작일 전에는 아무것도 하지 않는다
- 팀 목록: `node ops/admin-cli.mjs squad-list --project=yaguking-bc25c`
- 팀 이름 숨기기: `node ops/admin-cli.mjs squad-hide --project=yaguking-bc25c --code=<팀 코드>` (`--show`로 되돌림, 관리자 기록)
- **보호자 동의 승인**
  1. `node ops/admin-cli.mjs guardians --project=yaguking-bc25c` — 기다리는 동의 코드·신청일·가린 보호자 주소
  2. 받은 메일의 **보낸 주소**와 동의 코드를 확인하고: `node ops/admin-cli.mjs guardian-approve --project=yaguking-bc25c --code=<코드> --email=<보낸 주소>`
     (주소가 다르거나 7일이 지났으면 승인하지 않는다)
  3. 보호자에게 확인 메일로 답한다. 자녀는 앱에서 "동의됐는지 확인하기"
- **시행 전에 할 일**
  - 동의 메일 주소를 정해 `GUARDIAN_CONSENT_EMAIL`(`src/lib/auth/guardian.ts`)에 넣는다 — 처리방침 9절에도 실린다. 정하기 전에는 자녀 가입 길이 열리지 않는다(팀은 열린다)
  - 12-08까지 처리방침 개정 예고 공지(앱의 개정 예고는 7일 전부터 자동)
  - 배포는 규칙과 함께(`hosting,firestore:rules`), 운영 폴더 갱신(0시 작업에 squads·guardians-expire)

## 법·정책 메모

- 자녀 가입은 법정대리인 동의 확인 방법 중 "동의 내용이 적힌 메일을 보내 동의 의사를 메일로 받는 방법"에 가깝게: 보호자가 자녀가 적은 주소에서 동의 내용이 담긴 메일을 보내고, 운영자가 보낸 주소를 확인해 기록한다. 동의 전 수집은 동의를 받기 위한 보호자 연락처(메일)뿐이다
- 다만 가입 자체(로그인 메일)는 나이 응답 전에 이미 만들어진다 — 동의가 없으면 7일 뒤 지운다. 이 방식이 충분한지는 시행 전에 전문가 확인을 권한다
- 보상은 힌트용 보너스 포인트와 표시(배지)뿐 — 현금화·경품 없음

## 뒤로 미룬 것(4단계)

응원 문구(팀 활동 알림), 이어치기 이닝, 가족 도전·가족팀 순위, 시즌 우승 테두리, 미니앱판 팀(토스 로그인 이후), 이용약관의 팀 이름 규칙(이용약관 확정 때)

## 검증

- 단위: 앱·운영자 PC·규칙·처리방침 값 일치, 이름·로고·대비·리그 계산·감독 이어받기·7일
- 규칙(에뮬레이터): 만들기·읽기·신청·승인·9명·나가기·7일·내보내기·감독 넘기기·감독 일·리그 읽기, 팀 대항전 방, 보호자 동의(신청·동의 전·동의 뒤)
- 운영(에뮬레이터): 정리, 리그 계산, 월요일 확정·보너스·배지·지갑, 놓친 확정, 이름 숨기기, 자녀 익명, 동의 승인·기한 삭제
- E2E: 팀 만들기(실제 구단 이름 막기·로고), 링크 신청 → 승인, 리그 화면, 팀 대항전 방(팀원 아닌 사람 막기), 자녀 가입 길
