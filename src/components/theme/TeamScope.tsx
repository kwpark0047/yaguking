import type { ElementType, ReactNode } from 'react';
import { teamStyle, teamTheme } from '@/lib/theme/teams';
import { teamThemesEnabled } from '@/lib/theme/themeSwitch';

/**
 * 구단 테마를 **이 요소 안쪽에만** 입힌다.
 *
 * 앱 전체는 루트 레이아웃이 보는 사람의 구단으로 칠한다. 그런데 공유 카드는
 * 만든 사람의 구단이어야 하고, 랭킹은 행마다 그 선수의 구단이어야 한다.
 * 그런 곳에서 쓴다.
 *
 * 구단이 없으면 `brand`로 **명시적으로** 되돌린다. 그냥 두면 CSS 변수가
 * 상속되어 바깥(보는 사람의) 구단 색이 새어 들어온다.
 *
 * 서버 컴포넌트 전용이다(`TEAM_THEMES` 스위치를 서버에서 읽는다).
 */
export function TeamScope({
  slug,
  as: Tag = 'div',
  className,
  children,
  ...rest
}: {
  slug: string | null | undefined;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
} & Record<`aria-${string}`, string | undefined>) {
  const theme = teamTheme(teamThemesEnabled() ? slug : null);

  return (
    <Tag data-team={theme.slug} style={teamStyle(theme)} className={className} {...rest}>
      {children}
    </Tag>
  );
}
