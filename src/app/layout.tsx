import type { Metadata, Viewport } from 'next';
import { indexingAllowed } from '@/lib/seo/indexing';
import { BASE } from '@/lib/theme/base';
import { teamStyle, teamTheme } from '@/lib/theme/teams';
import { getThemeContext } from '@/server/theme/context';
import './globals.css';

export const metadata: Metadata = {
  title: '야구왕',
  description: 'KBO 기록 퀴즈를 1이닝 경기로. 3아웃이면 박스스코어가 남습니다.',
  // 소규모 노출 동안은 색인을 막는다. robots.txt는 크롤링만 막으므로
  // 외부 링크로 들어온 URL까지 막으려면 이 메타가 함께 있어야 한다
  // (11 문서 §3).
  robots: indexingAllowed()
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

/**
 * 모바일 주소창 색도 구단을 따른다. 구단이 없으면 페이지 배경색 그대로.
 * 테마 조회는 요청 안에서 한 번만 일어난다(레이아웃과 공유).
 */
export async function generateViewport(): Promise<Viewport> {
  const { teamSlug } = await getThemeContext();
  const team = teamSlug ? teamTheme(teamSlug) : null;

  return {
    width: 'device-width',
    initialScale: 1,
    // 확대 차단은 접근성 위반이므로 maximumScale을 제한하지 않는다 (08 문서 §8.3)
    themeColor: [
      {
        media: '(prefers-color-scheme: dark)',
        color: team ? team.dark.surface : BASE.dark.bgBase,
      },
      {
        media: '(prefers-color-scheme: light)',
        color: team ? team.light.surface : BASE.light.bgBase,
      },
    ],
  };
}

/**
 * 테마 자동 적용 (src/server/theme/context.ts).
 *
 * 보는 사람의 대표 구단과 등급을 <html>에 붙인다. 그 아래 모든 화면은 CSS
 * 변수로 이 값을 물려받는다. 공유 카드처럼 다른 사람의 구단을 보여야 하는
 * 곳은 그 요소에서 다시 지정한다.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { teamSlug, level } = await getThemeContext();
  const team = teamSlug ? teamTheme(teamSlug) : null;

  return (
    <html
      lang="ko"
      data-team={team?.slug}
      data-level={level ?? undefined}
      style={team ? teamStyle(team) : undefined}
    >
      <body>{children}</body>
    </html>
  );
}
