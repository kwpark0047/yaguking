# 배포 기록

## 2026-10-26 — 첫 배포 (사용자 승인: 실제 사이트까지)

| 항목 | 값 |
|---|---|
| Firebase 프로젝트 | `yaguking-bc25c` (기존 "YaguKing" 프로젝트를 사용 — 비어 있었음, **Spark**, 결제 계정 없음). `.firebaserc` 별칭 `prod` |
| 실제 사이트 | https://yaguking-bc25c.web.app (`yaguking-bc25c.firebaseapp.com`도 같은 사이트) |
| 미리보기 | https://yaguking-bc25c--preview-x374nwun.web.app — 2026-11-02 만료 |
| 올린 코드 | 커밋 `6c37a34`(9단계) — 배포 메시지 "6c37a34 first live" |
| Firestore | `(default)`, Standard, **asia-northeast3(서울)**, 운영 모드로 만든 뒤 `firestore.rules`·색인 배포. 예약 백업 없음(Blaze 필요) |
| 로그인 | 이메일/비밀번호, Google(공개 이름 "야구왕", 지원 이메일 운영자 계정), 익명. 이메일 링크는 끔 |
| 웹 앱 | `yaguking-web` — 설정값은 `.env.production.local`(커밋 안 함) |
| 승인된 도메인 | localhost, `yaguking-bc25c.firebaseapp.com`, `yaguking-bc25c.web.app`(기본), 미리보기 주소(채널 배포가 자동 추가) |

순서: 보안 규칙·색인 → 미리보기(배포 직전 점검 자동 실행) → 미리보기 점검 → 실제 사이트(점검 다시 자동 실행).

### 실제 환경에서 확인한 것

- 헤더: 화면 `no-cache`, 해시 파일 `max-age=31536000, immutable`, 보안 헤더 전부, `noindex`, HSTS(Hosting이 붙임).
  **같은 헤더는 뒤 규칙이 이긴다**는 가정이 실제로 맞음(로컬에서는 확인 불가였음)
- 비회원: 익명 로그인 → 남은 판 읽기 → 1이닝 → **저장 성공**(증가 연산 묶음이 배포 규칙 통과) → 오답노트 3개 조회
- 친구 대결: 방 만들기 → 대기실 실시간 표시 → 방 닫기
- 처리방침 화면, 모든 화면에서 콘솔 메시지 0(CSP 보고 전용 위반 없음)
- 남은 테스트 데이터: 비회원 계정 1개와 그 경기·오답(정리 작업을 켜면 30일 뒤 삭제), 방은 닫아서 없음

### 아직 확인하지 않은 것 / 할 일

- **이메일 가입·구글 로그인**: 실제 계정을 만드는 일이라 운영자가 직접 확인한다(에뮬레이터 E2E로는 통과)
- **처리방침은 초안**인 채로 공개됐다. 시행일 확정·법률 검토가 남음 — `docs/verification-report.md` §7
- **정리 작업이 꺼져 있다** — 켜야 처리방침의 "비회원 30일·대결 방 24시간 삭제"가 사실이 된다(`docs/deploy.md` §6)
- 없는 `/assets/...` 파일도 SPA 주소 처리 때문에 `index.html`(200, 1년 캐시)로 답한다. 새 배포 뒤 예전 화면이 지운 묶음을
  찾으면 오류 대신 HTML을 받는다 → 묶음 파일이 없으면 404를 내도록 주소 규칙을 고치거나, 묶음 불러오기 실패 시 새로고침하는 처리 후보
- 이 프로젝트에 Google Analytics가 연결돼 있다(기존 프로젝트). 앱은 Analytics를 불러오지 않아 수집은 없다. 원하면 콘솔 › 프로젝트 설정 › 통합에서 해제

### 되돌리기

콘솔 › Hosting › 출시 기록에서 이전 판 롤백, 규칙은 콘솔 › Firestore › 규칙 › 기록. 사이트를 내리려면 `npx.cmd firebase hosting:disable --project prod`.
