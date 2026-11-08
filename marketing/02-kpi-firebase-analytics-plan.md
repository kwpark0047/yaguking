# 야구왕 KPI·Firebase Analytics 검토

**작성일:** 2026-11-01  
**상태:** 측정 설계만 작성. SDK·이벤트·Firebase 설정·개인정보처리방침은 변경하지 않음.

## 1. 결론

Firebase Analytics 도입은 **기술적으로 가능하지만 현재 바로 켜면 안 된다.** `firebase-app`은 이미 Firebase JavaScript SDK를 사용하므로 모듈 추가 난도는 낮다. 그러나 현재 코드에는 Analytics 초기화와 이벤트가 없고, Firebase 설정에 `measurementId`가 없으며, 처리방침에는 방문 분석 도구와 쿠키를 사용하지 않는다고 명시되어 있다. Hosting의 현 CSP도 Analytics 전송 도메인을 허용하지 않는다.

따라서 순서는 `지표 정의 → 정책/동의 결정 → CSP·설정 설계 → 개발 → DebugView QA → 제한 공개 → 기준선 수집`이어야 한다. 마케팅 문서만 작성하는 이번 단계에서는 코드나 Firebase 콘솔을 건드리지 않는다.

## 2. 현재 측정 가능성과 한계

| 데이터 | 현재 출처 | 알 수 있는 것 | 알 수 없는 것 |
|---|---|---|---|
| Firebase Auth/회원 문서 | 관리자 화면·Firestore | 계정/프로필 완료 회원, 가입 방식 일부 | 가입 전 방문자, 단계별 이탈 |
| 게임 문서 | Firestore | 저장된 완료 경기 | 시작했지만 중단한 경기 |
| 대결 방/자리 | Firestore | 생성·참가·답·완료 방 | 링크 복사 후 외부 전송, 유입 채널 |
| 출석/등수 | Firestore | 회원 참여·구단 합계 | 비회원 재방문, 마케팅 채널 귀속 |
| Hosting | 배포·전송량 | 전체 전송량·무료 한도 | 마케팅용 사용자/세션 퍼널 |
| UTM | 아직 수집기 없음 | 링크 표준화만 가능 | 실제 방문/전환 귀속 |

Analytics 없이 쓸 수 있는 `신규 익명 계정 수`는 게임 시작까지 간 방문자의 하한선일 뿐 전체 신규 방문자가 아니다. `완료 게임 문서 수`도 시작 분모가 없어 완료율이 아니다. 이 한계를 대시보드에 명시한다.

## 3. 핵심 KPI 정의

모든 비율은 같은 닫힌 관찰기간의 분자·분모를 사용한다. 진행 중인 코호트는 실패가 아니라 `pending`으로 제외한다.

| KPI | 공식 정의 | 주기 | 데이터 소스 | 의사결정 |
|---|---|---|---|---|
| 신규 방문자 | 기간 중 처음 방문한 익명 브라우저/앱 인스턴스 고유 수. GA4 도입 시 `first_visit` 사용자 | 주간 | GA4 후보 | 채널 도달 규모 |
| 첫 게임 시작률 | 신규 방문자 중 24시간 안에 개인 게임을 시작한 수 ÷ 신규 방문자 | 주간 코호트 | `first_visit`, `game_start` | 홈 메시지/CTA |
| 퀴즈 완료율 | 개인 게임 완료 수 ÷ 개인 게임 시작 수. 동일 모드·기간, 중복 방지 | 주간 | `game_start`, `game_complete` | 난이도·길이·오류 |
| 회원가입 완료율 | 신규 방문자 중 7일 안에 연령 확인+닉네임+최애 구단 저장까지 끝낸 고유 사용자 ÷ 관찰창이 닫힌 신규 방문자 | 주간 코호트 | `first_visit`, `sign_up`, `onboarding_complete` | 가입 혜택·마찰 |
| 가입 퍼널 완료율 | 프로필 설정까지 완료한 수 ÷ 가입 시작 수 | 주간 | `signup_start`, `onboarding_complete` | 가입 단계별 개선 |
| 7일 재방문율 | 첫 게임 완료 후 1~7일 사이 다시 방문한 고유 사용자 ÷ 첫 완료 후 7일이 지난 사용자 | 주간 코호트 | `game_complete`, `session_start` | 리텐션 콘텐츠 |
| 7일 재완료율 | 첫 게임 완료 후 1~7일 사이 다시 게임을 완료한 사용자 ÷ 첫 완료 후 7일이 지난 사용자 | 주간 코호트 | `game_complete` | 실제 반복 가치 |
| 30일 재방문율 | 첫 완료 후 1~30일 내 재방문 사용자 ÷ 30일 창이 닫힌 첫 완료 사용자 | 월간 | GA4 | 장기 리텐션 |
| 초대 방문률 | 친구 대결 초대 랜딩 고유 수 ÷ 초대 링크 복사 고유 수 | 주간 | `invite_link_copied`, 랜딩 파라미터 | 공유 문구·채널 |
| 초대 대결 완료율 | 초대 랜딩 후 대결을 완료한 신규 사용자 ÷ 초대 랜딩 신규 사용자 | 주간 | `room_join`, `room_complete` | 바이럴 품질 |
| 추천 신규 기여율 | 초대 경유 첫 게임/대결 완료 신규 사용자 ÷ 전체 첫 완료 신규 사용자 | 월간 | 귀속 이벤트 | Referral 확대 여부 |
| 구단 참여율 | 출석한 회원 수 ÷ 프로필 완료 회원 수, 구단별/전체 | 주간 | Firestore 집계 | 구단 캠페인 |

**북극성:** 주간 유효 게임 완료 고유 사용자 수. 개인 게임 또는 친구 대결을 정상 완료한 고유 사용자로 정의하되, 중복 사용자는 1명으로 센다. 조작 가능한 점수를 북극성에 넣지 않는다.

### 요청 퍼널과 제품 실제 퍼널

야구왕은 가입 전 개인 퀴즈가 가능한 제품이다. 그래서 성장 판단에는 **제품 실제 퍼널**을 기본으로 쓰고, 요청한 `방문→회원가입→첫 퀴즈→친구 초대→재방문`은 회원 코호트용 보조 보고서로 함께 둔다. 두 퍼널의 분모를 합치지 않는다.

**제품 실제 퍼널(기본):**

`신규 방문(first_visit) → 첫 개인 퀴즈 시작(game_start) → 첫 개인 퀴즈 완료(game_complete) → 가입 성공(sign_up) → 프로필 완료(onboarding_complete) → 친구 초대 링크 복사(share) → 초대 대결 완료(room_complete) → 7일 내 재완료`

**요청 퍼널(회원 코호트 보고용):**

| 단계 | 판정 규칙 | 권장 창 | 단계 전환율 |
|---|---|---:|---|
| 방문 | `first_visit`가 발생한 신규 사용자 | 0일 | 시작 분모 |
| 회원가입 | `sign_up` 후 `onboarding_complete`까지 완료 | 방문 후 7일 | 가입 완료 ÷ 신규 방문 |
| 첫 퀴즈 | 가입 완료 뒤 처음 발생한 `game_complete` | 가입 후 24시간 | 가입 후 첫 퀴즈 완료 ÷ 가입 완료 |
| 친구 초대 | `content_type=room_invite`인 `share` 성공 | 첫 퀴즈 후 7일 | 초대 링크 복사 ÷ 가입 후 첫 퀴즈 완료 |
| 재방문 | 초대 뒤 1~7일 사이 `session_start`; 행동 리텐션은 `game_complete` 또는 `room_complete` | 초대 후 7일 | 재방문/재완료 ÷ 관찰창이 닫힌 초대 사용자 |

가입 전에 이미 개인 퀴즈를 완료한 사용자는 `pre_signup_activation=true`로 별도 집계한다. 이들을 “가입 후 첫 퀴즈 미완료”로만 보면 제품의 실제 활성화를 과소평가하므로, 요청 퍼널과 제품 실제 퍼널을 나란히 보고한다.

## 4. 90일 목표 설정

> **2026-11-01 기준선 반영:** 가입자 2·일 방문자 2·재방문율 100%(표본 2명)·담당 1명·예산 0원. 목표 수치는 [`05-baseline-reset-first-100-fans.md`](05-baseline-reset-first-100-fans.md) §3의 절대 목표를 따른다.

> 아래 상대 목표 표는 기준선이 30명 이상이 된 뒤에 다시 쓴다. 지금은 2명에서 출발해 상대 비율이 의미가 없다. 이벤트 수집 완전성 행은 Analytics 도입 후에 적용한다.

(보류) 첫 14일을 기준선으로 삼는 상대 목표:

| 지표 | 1~14일 | 30일 | 90일 임시 목표 |
|---|---|---|---|
| 이벤트 수집 완전성 | QA로 누락/중복 확인 | 핵심 이벤트 95% 이상 정상 | 98% 이상 유지 |
| 주간 신규 방문자 | 기준선 | 채널별 기준선 확정 | 2주차 대비 100% 증가, 단 스팸 제외 |
| 퀴즈 완료율 | 기준선 | 가장 큰 이탈 구간 1개 확인 | 기준선 대비 15% 상대 개선 |
| 회원가입 완료율 | 기준선 | 가입 이탈 단계 확인 | 기준선 대비 20% 상대 개선 |
| 7일 재완료율 | 8일차부터 첫 값 | 콘텐츠/출석 노출군 비교 | 기준선 대비 25% 상대 개선 |
| 추천 신규 기여율 | 초대 귀속 구현 후 기준선 | 친구 대결 주간 2회 | 전체 첫 완료 신규의 15% 후보 목표 |

표본이 작을 때는 비율과 함께 분자/분모를 반드시 적는다. 예: `7/20 = 35%`, 비율만 쓰지 않는다.

## 5. 이벤트 설계

Firebase/GA4 권장 이벤트가 있으면 그대로 쓰고, 야구왕 전용 단계만 custom event로 둔다. 이벤트 이름은 소문자+밑줄을 사용한다.

### 핵심 이벤트

| 이벤트 | 종류 | 발생 시점 | 허용 속성 | 금지 속성 |
|---|---|---|---|---|
| `page_view` | 자동/수동 | SPA 경로가 바뀔 때 | `page_path`, `page_title` | 전체 쿼리의 방 코드·개인 식별값 |
| `game_start` | custom | 첫 문항이 실제로 표시될 때 | `mode=practice`, `member_state`, `entry_point` | 문항 원문, UID |
| `game_complete` | custom | 결과 화면이 처음 표시될 때 1회 | `mode`, `at_bat_count`, `outcome_band`, `member_state`, `save_status` | 세션 ID, 정답 목록 |
| `record_save_succeeded` | custom | 경기 기록 저장 성공 | `mode`, `member_state` | 문서 ID, UID |
| `sign_up` | GA4 권장 | Firebase Auth 계정 연결/생성 성공 | `method=email/google` | 이메일, 닉네임 |
| `onboarding_step_complete` | custom | 연령/닉네임/구단 각 단계 완료 | `step_name`, `step_number` | 입력값 원문, 선수 이름 |
| `onboarding_complete` | custom | 프로필 저장 성공 | `method`, `carried_guest_record`(boolean) | 구단·닉네임을 초기에는 보내지 않음 |
| `level_start` | GA4 게임 권장 | 레벨 테스트 시작 | `level_name=placement` | 문항 ID |
| `level_end` | GA4 게임 권장 | 레벨 테스트 결과 표시 | `level_name=placement`, `success=true` | 세부 답안 |
| `share` | GA4 권장 | 초대 링크 복사 성공 | `method=copy_link`, `content_type=room_invite` | 방 코드 |
| `room_landing_view` | custom | `/room/:code` 진입 시 1회 | `entry_point=shared_link/direct_code`, `member_state` | 실제 경로의 방 코드 |
| `room_join` | custom | 방 참가 성공 | `member_state`, `room_size_band` | 방 코드, 참가자 이름 |
| `room_complete` | custom | 최종 순위 표시 | `player_count_band`, `question_count` | 닉네임, 점수표 전체 |
| `attendance_complete` | custom | 출석 저장 성공 | `streak_band`, `double_day` | 날짜별 원본 배열 |
| `daily_quiz_start` | custom | 오늘의 공식전 첫 문제가 표시될 때 | `quiz_type=official`, `member_state=member` | 날짜별 라운드 ID, 문항 원문 |
| `daily_quiz_submit` | custom | 오늘의 공식전 제출 완료 | `answered_count`, `total_count` | 고른 보기, 답한 시각 |
| `pwa_install` | custom | 설치 완료 이벤트 | `platform_hint` | 기기 고유값 |
| `error_occurred` | custom | 사용자 행동이 막히는 오류 | `error_type`, `surface` | Firebase 원문 오류에 포함된 PII |

Google은 게임용 권장 이벤트로 `level_start`, `level_end`, `level_up`, `post_score`, `unlock_achievement`를 제공한다. 야구왕은 공식 점수와 비공식 점수가 섞이지 않게 `post_score`를 초기 KPI에서 제외하는 편이 안전하다. [GA4 권장 이벤트](https://developers.google.com/analytics/devguides/collection/ga4/reference/events)

`page_view`의 `page_path`는 `/room/ABC123`처럼 방 코드를 보내지 말고 `/room/:code`로 정규화한다. 초대 링크도 방 코드를 UTM이나 이벤트 속성에 복사하지 않는다. 향후 귀속용 `src=invite`를 붙이더라도 값은 고정된 비식별 문자열만 사용한다.

### 사용자 속성 최소화

초기에는 `member_state`(visitor/guest/member) 외 사용자 속성을 만들지 않는다. 이메일, 닉네임, 최애 선수, Firebase UID, 방 코드, 세밀한 위치, 자유 입력값은 보내지 않는다. Google Analytics 정책도 이메일·전화번호 등 개인식별정보를 이벤트·URL·UTM에 보내지 말 것을 요구한다. [Google Analytics PII 가이드](https://support.google.com/analytics/answer/6366371?hl=en)

## 6. Firebase Analytics 기술 가능성

### 가능한 이유

- Firebase 공식 문서는 기존 프로젝트의 Settings > Integrations에서 Analytics를 나중에 활성화할 수 있다고 안내한다.
- Web SDK는 `firebase/analytics`의 `getAnalytics()`와 `logEvent()`를 제공한다.
- `measurementId`는 최신 SDK에서 동적으로 가져올 수 있으나, 설정값에 두면 예외 상황의 fallback이 된다.
- Analytics는 no-cost 서비스로 안내되며 Firestore 읽기/쓰기 할당량과 별도다. [Firebase Analytics 소개](https://firebase.google.com/docs/analytics)

### 현재 막힌 조건

| 조건 | 현재 코드/운영 | 필요한 결정 |
|---|---|---|
| Firebase 연동 | Analytics 미활성 여부 콘솔 확인 불가 | 프로젝트 Integration 상태 확인 |
| Web 설정 | `measurementId` 없음 | 환경 변수/구성 방식 결정 |
| SDK | `firebase/analytics` import 없음 | 지원 브라우저 검사 포함한 지연 로드 설계 |
| SPA 페이지뷰 | React Router 수동 로깅 없음 | 경로 변경 시 1회만 발생하도록 설계 |
| 개인정보 | 정책이 “분석 도구 미사용·쿠키 미사용” 명시 | 정책 개정·고지·동의/거부 방식 검토 |
| CSP | `script-src`/`connect-src`에 Analytics 도메인 없음 | 실제 네트워크 요청을 Preview에서 관찰해 최소 허용 |
| QA | DebugView/내부 트래픽 제외 없음 | 개발·운영 이벤트 분리, 중복 검증 |

Firebase 공식 Web 가이드는 Analytics 활성화, Web 앱 데이터 스트림 연결, SDK 초기화와 `logEvent()` 사용을 안내한다. [Firebase Analytics Web 시작 가이드](https://firebase.google.com/docs/analytics/web/get-started)

## 7. 개인정보·동의 검토 체크리스트

이 문서는 법률 자문이 아니다. 실제 도입 전 운영 책임자와 개인정보 검토자가 현재 사용자·지역·수집 범위에 맞게 결정한다.

- [ ] 처리방침의 “방문 분석 도구를 쓰지 않음”, “쿠키를 쓰지 않음” 문구를 실제 구현과 일치시킨다.
- [ ] Analytics가 기본적으로 사용자/세션, 대략적 위치, 브라우저·기기 정보를 수집할 수 있음을 검토한다. [Google Analytics 수집 정보](https://support.google.com/analytics/answer/11593727?hl=en)
- [ ] 광고 개인화와 Google Signals를 기본 비활성으로 시작한다.
- [ ] 분석 저장 동의가 필요한 범위와 거부 UI를 검토한다.
- [ ] Consent Mode를 쓰면 `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization` 기본 상태와 변경 시점을 정의한다. [Google Consent Mode Web 가이드](https://developers.google.com/tag-platform/security/guides/consent)
- [ ] GA4 사용자/이벤트 데이터 보관 기간은 최소값부터 시작하고 문서화한다. GA4 표준 속성은 사용자 수준 데이터 보관을 2개월 또는 14개월로 설정할 수 있다. [데이터 보관 도움말](https://support.google.com/analytics/answer/7667196)
- [ ] 계정 삭제 시 Analytics 사용자 데이터 삭제 요구를 처리할 운영 절차를 검토한다.
- [ ] UTM에 이메일·닉네임·UID·방 코드를 넣지 않는다.

## 8. 구현 전후 QA 계획

### 개발 전

1. 이벤트 사전과 소유자를 승인한다.
2. 처리방침·동의·보관·데이터 공유 설정을 확정한다.
3. 개발/운영 데이터 스트림 분리 또는 내부 트래픽 제외 방식을 정한다.
4. Firebase 무료 한도와 별개지만 번들·CSP·PWA 오프라인 동작 영향도 확인한다.

### Preview 검증

- DebugView에서 각 이벤트가 정확히 한 번 발생하는지 확인.
- 새로고침, 뒤로가기, 익명→회원 연결, Google 로그인 왕복에서 중복 여부 확인.
- 이메일·닉네임·방 코드·문항 원문이 URL/이벤트/오류에 없는지 네트워크 탭으로 확인.
- 동의 거부 시 의도한 수집 중단이 작동하는지 확인.
- 현재 report-only CSP에 나타난 실제 Analytics 도메인만 허용 목록 후보로 기록.
- 모바일/PWA standalone과 일반 브라우저를 각각 테스트.

### 출시 후 7일

- GA4 총 완료 이벤트와 Firestore 저장 완료 게임 수를 날짜별로 대조한다.
- 차이가 5%를 넘으면 KPI 보고를 중단하고 누락/중복을 먼저 수정한다.
- 내부/테스트 트래픽과 운영자 활동을 제외한다.
- 24~48시간 처리 지연이 있는 보고서와 실시간 보고서를 혼동하지 않는다.

## 9. UTM 표준

모두 소문자, 단어는 하이픈으로 연결하고 개인정보를 넣지 않는다.

| 채널 | `utm_source` | `utm_medium` | 캠페인 예시 |
|---|---|---|---|
| Facebook | `facebook` | `social` | `2026-11-fan-inning` |
| 네이버 블로그 | `naver` | `blog` | `2026-11-fan-inning` |
| X | `x` | `social` | `2026-11-fan-inning` |
| Threads | `threads` | `social` | `2026-11-fan-inning` |
| 팬 커뮤니티 | 커뮤니티 영문 슬러그 | `community` | `2026-11-community-pilot` |

`utm_content`는 `d05-engagement-launch`, `rules-no-game`, `friend-room-10q`처럼 소재를 구분한다. 동일 게시물이라도 플랫폼/게재일이 다르면 별도 링크를 쓴다.

## 10. 주간 대시보드

| 구역 | 표시 값 |
|---|---|
| 획득 | 채널별 신규 방문자, 세션, 게임 시작률 |
| 활성화 | 게임 시작/완료 원수와 완료율, 가입 시작/완료 원수와 완료율 |
| 유지 | D1, 7일 재방문, 7일 재완료, 30일 pending/closed |
| 추천 | 링크 복사, 초대 랜딩, 방 참가, 대결 완료, 추천 신규 기여율 |
| 콘텐츠 | 게시물별 비용 시간, 노출, 클릭, 첫 완료, 다음 행동 |
| 품질 | 오류율, 문항 정정, 신고, Firebase 읽기/쓰기/전송량 |

매주 한 가지 결정만 연결한다. 예: “Threads 조회가 증가했다”가 아니라 “Threads의 구단 질문 소재가 첫 게임 시작률을 반복적으로 높여 다음 주 비중을 20%→30%로 늘린다.”

