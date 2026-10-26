# 기존 앱에서 복사한 코드

복사 시점: 2026-10-26, 기존 앱 커밋 `5cdc4cc` (`feat/p1-one-inning`).
**원본(`../src`, `../tests`)은 지우거나 고치지 않았다.** 두 앱이 갈라지므로, 원본을 고치면
여기도 고칠지 판단한다.

| 복사본 | 원본 | 바꾼 것 |
|---|---|---|
| `src/lib/engine/*` | `src/lib/engine/*` | 없음 (순수 함수) |
| `src/lib/theme/*` | `src/lib/theme/*` | `themeSwitch.ts`: `process.env.TEAM_THEMES` → `import.meta.env.VITE_TEAM_THEMES` |
| `src/lib/achievements/rules.ts` | 같음 | 없음 |
| `src/lib/game/labels.ts`, `nickname.ts` | 같음 | 없음 |
| `src/lib/design/contrast.ts` | 같음 | 없음 |
| `src/app/globals.css` | `src/app/globals.css` | 없음. `--font-cute` 글꼴은 1단계에서 연결(지금은 시스템 글꼴로 대체) |
| `src/components/brand/Mascot.tsx` | 같음 | 없음 |
| `tests/unit/engine`, `game`, `design`, `achievements/rules`, `theme/{color,palette,stylePreference,styles}` | 같음 | `palette.test.ts`: 구단 목록을 `supabase/seed.sql` 대신 `src/content/teams.ts`에서 읽음 |

새로 만든 것: `src/content/teams.ts`(기존 seed.sql과 같은 10개 구단), `src/lib/env.ts`,
`src/lib/firebase.ts`, `src/App.tsx`, `src/main.tsx`, Firebase 설정 파일들.

복사하지 않은 것(서버에 기대므로 Firebase판에서 다시 만든다): `src/server/**`, `src/app/**`의
페이지·API, `supabase/**`, `proxy.ts`, 통합·E2E 테스트, `src/lib/supabase`, `src/lib/db`.
