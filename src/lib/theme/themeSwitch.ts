/**
 * 구단 테마 스위치.
 *
 * 08 문서는 원래 "공식 구단 컬러를 식별 표지로 사용하지 않는다"였다. 구단
 * 테마는 2026-10-24 요청으로 들어왔고 권리 검토는 아직이다(11 문서 §4).
 * 검토 결과가 "쓰지 말 것"이면 코드를 고치지 않고 `TEAM_THEMES=off`로 끈다.
 *
 * 꺼도 레벨 등급 테마는 그대로다 — 등급색은 자체 제작이라 권리 문제가 없다.
 */
export function teamThemesEnabled(): boolean {
  return process.env.TEAM_THEMES !== 'off';
}
