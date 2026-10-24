import { teamStyle, teamTheme } from './teams';

const TEAM_VARIABLES = Object.keys(teamStyle(teamTheme(null)));

/**
 * 화면 전체의 구단 테마를 **즉시** 바꾼다. 구단을 고르는 순간 미리 보여 주기
 * 위해서다(온보딩·설정).
 *
 * 서버는 다음 요청부터 같은 값을 <html>에 그린다. 그 사이 클라이언트가 칠해
 * 두는 것뿐이므로, 저장에 실패하면 호출자가 이전 구단으로 되돌려야 한다.
 *
 * `null`이면 브랜드 기본으로 돌아간다. `data-team`을 지우고 변수도 지운다 —
 * 변수만 남으면 CSS 규칙은 꺼져도 값이 남아 혼란스럽다.
 */
export function applyDocumentTeam(slug: string | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const theme = teamTheme(slug);

  if (theme.slug === 'brand') {
    delete root.dataset.team;
    for (const name of TEAM_VARIABLES) root.style.removeProperty(name);
    return;
  }

  root.dataset.team = theme.slug;
  for (const [name, value] of Object.entries(teamStyle(theme))) {
    root.style.setProperty(name, String(value));
  }
}
