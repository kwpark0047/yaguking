import type { Metadata, Viewport } from 'next';
import { indexingAllowed } from '@/lib/seo/indexing';
import { SURFACES } from '@/lib/theme/base';
import { AUTO_STYLE_SCRIPT, explicitStyle } from '@/lib/theme/style';
import { teamStyle, teamTheme, teamTokens } from '@/lib/theme/teams';
import { getThemeContext } from '@/server/theme/context';
import { getStylePreference } from '@/server/theme/style';
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
 * 모바일 주소창 색도 구단·스타일을 따른다. 구단이 없으면 페이지 배경색.
 * '자동' 스타일은 기기 설정을 서버가 모르므로 기본 스타일 값을 쓴다.
 * 테마 조회는 요청 안에서 한 번만 일어난다(레이아웃과 공유).
 */
export async function generateViewport(): Promise<Viewport> {
  const [{ teamSlug }, preference] = await Promise.all([
    getThemeContext(),
    getStylePreference(),
  ]);
  const style = explicitStyle(preference) ?? 'default';
  const team = teamSlug ? teamTheme(teamSlug) : null;

  const color = (scheme: 'dark' | 'light') =>
    team ? teamTokens(team, scheme, style).surface : SURFACES[style][scheme].bgBase;

  return {
    width: 'device-width',
    initialScale: 1,
    // 확대 차단은 접근성 위반이므로 maximumScale을 제한하지 않는다 (08 문서 §8.3)
    themeColor: [
      { media: '(prefers-color-scheme: dark)', color: color('dark') },
      { media: '(prefers-color-scheme: light)', color: color('light') },
    ],
  };
}

/**
 * 테마 자동 적용 (src/server/theme/context.ts, src/server/theme/style.ts).
 *
 * 보는 사람의 대표 구단·등급·화면 스타일을 <html>에 붙인다. 그 아래 모든
 * 화면은 CSS 변수로 이 값을 물려받는다. 공유 카드처럼 다른 사람의 구단을
 * 보여야 하는 곳은 그 요소에서 다시 지정한다.
 *
 * 스타일을 직접 고른 사람은 서버가 바로 그린다. '자동'이면 <head>의 짧은
 * 스크립트가 그리기 전에 기기 설정을 보고 정한다. 그 스크립트가 <html> 속성을
 * 바꾸므로 이 요소에 한해 하이드레이션 경고를 끈다(한 단계만 적용된다).
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [{ teamSlug, level }, preference] = await Promise.all([
    getThemeContext(),
    getStylePreference(),
  ]);
  const team = teamSlug ? teamTheme(teamSlug) : null;
  const style = explicitStyle(preference);

  return (
    <html
      lang="ko"
      data-team={team?.slug}
      data-level={level ?? undefined}
      data-style={style ?? undefined}
      data-style-source={style ? 'user' : undefined}
      style={team ? teamStyle(team) : undefined}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: AUTO_STYLE_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
