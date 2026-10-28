# 즐겨찾기·홈 화면에 추가(PWA)

2026-10-29. 머리줄 별표(즐겨찾기 방법)와 가입 직후 "홈 화면에 추가" 권유. 새 의존성 없음(PWA 도구 없이 직접 작성).

## 1. 무엇이 어디에

| 기능 | 위치 |
|---|---|
| 매니페스트(이름·짧은 이름 "야구왕", 시작·범위 `/`, standalone, 색 `#0b1730`, 192·512 아이콘 + maskable) | `public/manifest.webmanifest`, `index.html`(manifest·theme-color·apple-touch-icon) |
| 아이콘(엠블럼을 밤하늘 색 정사각형에, maskable은 안전 구역 안) | `public/icons/*.png` — `node scripts/make-icons.mjs`(Playwright 크롬으로 그림) |
| 서비스 워커(같은 주소의 해시 정적 파일·아이콘만 저장, 판 관리) | `public/sw.js` |
| 설치 상태(기기 판별·`beforeinstallprompt`·`appinstalled`·standalone·"나중에" 기억·서비스 워커 등록) | `src/lib/pwa/install.ts` |
| 머리줄 별표 → 즐겨찾기 방법 창(윈도·리눅스 Ctrl + D, 맥 ⌘ Cmd + D, 휴대폰은 홈 화면에 추가) | `src/components/pwa/BookmarkButton.tsx`, `SiteHeader` |
| 가입 직후 권유(화면 아래 카드, 환영 띠가 닫힌 뒤 메인에서만) "⚾ 야구왕을 홈 화면에 추가하고 언제든 야구 퀴즈에 도전하세요!" + 앱 설치하기·나중에 | `src/components/pwa/InstallOffer.tsx`, `App.tsx` `WelcomeBanner` |
| 설정 "앱 설치"(언제든 다시) | `SettingsPage` + `InstallActions` |
| 창·설치 안내(브라우저 기본 `<dialog>` — Esc, 뒤쪽 막힘, 초점 복귀) | `src/components/pwa/InstallGuide.tsx` |

## 2. 동작

- **즐겨찾기**: 브라우저가 사이트의 자동 북마크를 막으므로 단축키·메뉴만 알려 준다. 데스크톱 크롬·엣지·맥 사파리 17+는 같은 창에 "앱처럼 설치"도
- **가입 직후 권유**: 프로필 저장 → 환영 띠(2.6초) → 메인에서만 아래 카드. 이미 설치(설치 완료 또는 홈 화면 앱으로 열림)·"나중에"를 골랐음·이 브라우저에서 설치 불가면
  띄우지 않는다. 가입·로그인과 무관 — 설치하지 않아도 모든 기능이 그대로
- **앱 설치하기**: 브라우저가 설치 창을 줄 수 있으면(`beforeinstallprompt` — 크롬·엣지·삼성 인터넷) 바로 띄운다. 없으면 기기별 안내:
  - iOS 사파리: 공유 단추 → 홈 화면에 추가 → 추가(3단계). iOS의 다른 브라우저·카카오톡 등 앱 안 브라우저는 "사파리로 열기"
  - 안드로이드: 메뉴(⋮) → 앱 설치/홈 화면에 추가
  - 데스크톱 크롬·엣지: 주소창의 설치 아이콘 또는 메뉴 → 앱 설치 / 맥 사파리 17+: 파일 → Dock에 추가
  - 파이어폭스·옛 사파리(데스크톱): 설치 미지원 → 북마크 단축키
- **"나중에"**: 이 기기 저장소 `yk_pwa`에 `dismissedAt` — 가입 직후 권유만 다시 안 띄움(설정·별표는 그대로). 설치하면 `installed: true`
- **서비스 워커**: 운영 빌드에서만 `load` 뒤 등록(개발 서버·E2E는 없음).
  - 저장: 같은 주소 `/assets/*`(파일 이름에 해시)·`/icons/*`, GET, 검색어 없는 것만. 최대 80개
  - **저장하지 않음**: 화면(HTML — 항상 네트워크라 배포하면 바로 새 화면), 로그인 처리 `/__/`, 다른 주소(Firebase 인증·Firestore 등 — 토큰·개인 기록·API 응답), GET 아닌 요청
  - **오프라인 기능은 없다**(약속하지 않음 — 화면 요청을 가로채지 않는다)
  - 판: `CACHE = 'yaguking-static-v1'`. 저장 방식을 바꾸면 v2로 올린다 → 활성화될 때 이전 판을 지운다. `skipWaiting`·`clients.claim`으로 다음 열기부터 바로 새 워커
- Hosting: `sw.js`·매니페스트는 기존 `**` 헤더(`no-cache`)라 배포 즉시 새 판을 확인한다. CSP(보고 전용)의 `default-src 'self'`로 매니페스트·워커가 허용된다

## 3. 확인

| 묶음 | 결과 |
|---|---|
| 단위 `tests/unit/pwa.test.ts` | 기기 판별(윈도·맥·아이패드·아이폰·안드로이드·카카오톡), 수동 설치 가능 여부, 매니페스트 값·아이콘 실제 크기(PNG 머리), index.html 링크, **서비스 워커 저장 규칙**(해시 파일만, HTML·`/__/`·Firestore·인증·POST·검색어 거절, 판 정리, 화면 요청 미개입) |
| E2E `tests/e2e/pwa.spec.ts`(360·1280) | 윈도 Ctrl + D·Esc·초점 복귀·axe, 맥 ⌘ Cmd + D, 아이폰 사파리 3단계(설치 단추 없음), 안드로이드 메뉴 안내 + 설치 창 이벤트 → "앱 설치하기" → prompt 호출, 가입 직후 권유 → "나중에" 기억 → 게임 정상, 설정에서 설치 → `appinstalled` → "이미 설치", 홈 화면 앱(standalone)으로 연 사람은 권유 없음 |
| 운영 빌드 `node scripts/check-pwa.mjs` | 크롬 DevTools로: 매니페스트 오류 0, **설치 가능 판정 오류 0**, 서비스 워커 등록·페이지 제어, 저장소에 `/assets`·`/icons`만 |

- 실제 기기(안드로이드 크롬·아이폰 사파리)에서 설치를 눌러 보는 것은 배포 뒤 운영자가 확인한다(자동 테스트는 크롬 판정·이벤트 흉내까지)

## 4. 배포

이용자 앱만 바뀐다(규칙·관리자 사이트 무관).

```
npx firebase hosting:channel:deploy preview --only app --project prod   # 미리보기
node scripts/check-pwa.mjs https://yaguking--preview-qeclifhr.web.app      # 미리보기 PWA 확인
npx firebase deploy --only hosting:app --project prod                     # 실제(승인 뒤)
node scripts/check-pwa.mjs https://yaguking.web.app
```

- 되돌리기: 서비스 워커를 없애야 하면 `public/sw.js`를 "모든 저장소 지우고 스스로 등록 해제" 판으로 바꿔 배포(파일을 지우면 이미 설치된 워커가 남는다)
- 예전 주소(yaguking-bc25c.web.app)는 새 주소로 넘기므로 설치는 새 주소 기준
