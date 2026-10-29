import { readTheme } from '@/lib/display/preference';

/**
 * 구단 테마 스위치.
 *
 * 08 문서는 원래 "공식 구단 컬러를 식별 표지로 사용하지 않는다"였다. 구단
 * 테마는 2026-10-24 요청으로 들어왔고 권리 검토는 아직이다(11 문서 §4).
 * 검토 결과가 "쓰지 말 것"이면 코드를 고치지 않고 `VITE_TEAM_THEMES=off`로 끈다.
 *
 * 꺼도 레벨 등급 테마는 그대로다 — 등급색은 자체 제작이라 권리 문제가 없다.
 */
export function teamThemesEnabled(): boolean {
  // Firebase판(Vite): 서버가 없으므로 빌드 시 환경 변수로 정한다(.env.example).
  return import.meta.env.VITE_TEAM_THEMES !== 'off';
}

/**
 * 화면 전체를 구단색으로 칠할까 — 구단 테마 스위치가 켜져 있고, 설정 › 화면의 테마가 "내 구단"일 때만(docs/game-look-plan.md).
 * 다른 테마(나이트 골드 등)를 고르면 구단색 대신 그 테마색이다. 구단 고르기 단추의 구단색 칩은 이와 상관없이 보인다.
 */
export function teamThemeActive(): boolean {
  return teamThemesEnabled() && readTheme() === 'team';
}
