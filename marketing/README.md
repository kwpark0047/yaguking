# 야구왕 마케팅 기획 문서

**작성/검토일:** 2026-11-01  
**범위:** 분석과 기획만 수행. 프로젝트 소스코드·Firebase 설정·데이터베이스는 수정하지 않음.

## 문서 지도

| 순서 | 문서 | 용도 |
|---:|---|---|
| 1 | [`00-project-customer-analysis.md`](00-project-customer-analysis.md) | 저장소/운영판 구분, 회원가입·레벨 테스트·개인 퀴즈·친구 대결 점검, 타깃/차별화, 고객 연구 계획 |
| 2 | [`product-marketing-context.md`](product-marketing-context.md) | 제품·고객·포지셔닝·브랜드 언어의 공통 기준 |
| 3 | [`yaguking-90-day-plan.md`](yaguking-90-day-plan.md) | AARRR 기반 90일 총괄 실행계획 |
| 4 | [`01-channel-referral-strategy.md`](01-channel-referral-strategy.md) | Facebook·네이버 블로그·X·Threads 운영, 친구 초대·구단 경쟁 바이럴 전략 |
| 5 | [`02-kpi-firebase-analytics-plan.md`](02-kpi-firebase-analytics-plan.md) | KPI 공식, 이벤트 사전, Firebase Analytics 가능성·정책/QA 게이트 |
| 6 | [`03-30-day-content-calendar.md`](03-30-day-content-calendar.md) | 2026년 11월 30일 발행 일정과 제작/회고 방식 |
| 7 | [`04-90-day-execution-plan.md`](04-90-day-execution-plan.md) | 13주 날짜별 실행판: 11/05 시즌 오픈, 주간 리듬, 무료 한도 게이트, 중단 기준, 제품 요청 목록 |
| 8 | [`05-baseline-reset-first-100-fans.md`](05-baseline-reset-first-100-fans.md) | **기준선(가입 2·일 방문 2·담당 1·예산 0) 반영 목표.** 절대 목표, 첫 30일 씨앗 계획, 구단 대항전 3명 조건 대응 |
| 9 | [`06-kbo-fandom-market-analysis.md`](06-kbo-fandom-market-analysis.md) | 시장 분석, 10개 구단 팬덤 공략 순서, 행동 기준 고객군 4개, 기능 구현/미구현 표, 공식전 문항 풀 위험 |
| 10 | [`07-viral-growth-strategy.md`](07-viral-growth-strategy.md) | 결과 공유(미구현)·친구 대결·구단 랭킹·일일 퀴즈 바이럴 전략, 가입 전환 지점 |

## 요청 문서 7종 대응표

| 요청 문서 | 파일 |
|---|---|
| 시장 분석 | `06-kbo-fandom-market-analysis.md` (+ `00-project-customer-analysis.md` 기능 점검) |
| 마케팅 전략 | `yaguking-90-day-plan.md`, `product-marketing-context.md` |
| 채널별 홍보 계획 | `01-channel-referral-strategy.md` §4 (Facebook·네이버 블로그·X·Threads) |
| 30일 콘텐츠 캘린더 | `03-30-day-content-calendar.md` (+ `05` §5 수정 5건) |
| 바이럴 전략 | `07-viral-growth-strategy.md` (+ `01` §6~7) |
| KPI 설계 | `02-kpi-firebase-analytics-plan.md` (이벤트·퍼널), `05` §3 (절대 목표) |
| 실행 로드맵 | `04-90-day-execution-plan.md` (+ `05` §4 첫 30일) |

## 현재 기준선 (2026-11-01, 운영자 제공)

가입자 2명 · 일 방문자 2명 · 재방문율 100%(표본 2명) · 담당 1명 · 예산 0원. 지금은 성장률을 높이는 단계가 아니라 첫 사용자를 만드는 단계다. 목표 수치는 05 문서를 따른다.

## 경영진용 핵심 결정

1. 현재 마케팅 기준 서비스는 `firebase-app/`과 `https://yaguking.web.app/`이다. 루트 Next.js판의 기능을 운영 기능으로 홍보하지 않는다.
2. 현재 Firebase판에는 친구 대결 초대 링크는 있지만 개인 경기 결과 공유 카드/버튼은 없다.
3. Firebase Analytics는 기술적으로 도입 가능하지만 현재 미설치이며, 처리방침·동의·CSP·QA 결정 전에는 활성화하지 않는다.
4. 공개 응답은 `noindex` 상태다. 검색 공개를 승인하기 전에는 네이버 블로그를 주요 검색 자산으로 사용한다.
5. 출석·오늘의 공식전·구단 대항전은 코드상 2026-11-05 시작이다. 실제 운영 확인 후에만 출시 홍보한다.
6. 90일간 유료광고는 0원으로 유지하고 콘텐츠·커뮤니티·친구 초대·구단 경쟁에서 반복 가능한 성장 루프를 찾는다.

## 1~2주 우선 실행 체크리스트

- [ ] 11/05 참여 기능의 운영 문항·배치·화면 스모크 테스트
- [ ] 이용약관 확정 상태와 데이터/상표/이미지 사용 범위 확인
- [ ] KPI·이벤트 사전 승인, Firebase Analytics 도입 여부 결정
- [ ] 개인정보처리방침/동의/CSP 변경 영향 검토
- [ ] Facebook·네이버 블로그·X·Threads 프로필과 고정글 개설/정리
- [ ] UTM 명명 규칙 적용
- [ ] 세그먼트별 5명, 총 15명 고객 인터뷰 모집
- [ ] 11월 콘텐츠 캘린더 첫 주 자산 제작
- [ ] Firebase 무료 한도 주간 모니터링 담당 지정

## 사용한 Marketing Skills

- `product-marketing`: 제품 컨텍스트·포지셔닝·브랜드 보이스
- `marketing-plan`: AARRR와 90일 우선순위
- `customer-research`: 가설/증거 분리, 최소 표본, 인터뷰 설계
- `social`: 채널별 포맷·빈도·재가공·운영 루틴
- `referrals`: 가치 경험 뒤 초대, 제품 내 바이럴, 비금전 보상 원칙
- `analytics`: KPI 공식, 동일 관찰창, 이벤트 명명, UTM·데이터 품질

설치된 보조 스킬 `content-strategy`, `onboarding`, `seo-audit`, `marketing-loops`는 다음 실행 단계의 심화 작업에 사용할 수 있다.

