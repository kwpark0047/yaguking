import { tierStyle, tierTheme } from '@/lib/theme/tiers';

/**
 * 등급 배지.
 *
 * 등급은 **글자가 1차 정보**다(08 문서 §4.3). 색과 장식은 보조이며, 색을 못
 * 보는 사람도 "Lv.5 골든글러브"를 읽을 수 있다.
 *
 * 서버·클라이언트 어디서나 쓸 수 있도록 훅을 쓰지 않는다.
 */
export function LevelBadge({
  level,
  showNumber = true,
  className,
}: {
  level: number;
  /** "Lv.5"를 함께 보일지. 좁은 자리(랭킹 행)에서는 이름만 쓴다. */
  showNumber?: boolean;
  className?: string;
}) {
  const theme = tierTheme(level);

  return (
    <span
      data-tier={theme.level}
      data-ornament={theme.ornament}
      style={tierStyle(theme)}
      className={['tier-badge', className].filter(Boolean).join(' ')}
    >
      {showNumber && <span className="num-tabular">Lv.{theme.level}</span>}
      <span>{theme.name}</span>
    </span>
  );
}
