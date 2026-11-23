import { colorHex, LOGO_SYMBOLS, type SquadLogo as Logo } from '@/lib/squad/squad';

/**
 * 팀 로고 — 저장된 설정값(틀·상징·주색·보조색·이니셜)을 기기가 SVG로 그린다(그림 파일을 올리지 않는다).
 * 주간 리그 1~3위 배지가 있으면 오른쪽 위에 금·은·동 별을 붙인다.
 */
const FRAMES: Record<Logo['frame'], string> = {
  shield: 'M50 4 L90 15 V47 C90 73 72 89 50 97 C28 89 10 73 10 47 V15 Z',
  circle: 'M50 5 A45 45 0 1 1 49.99 5 Z',
  diamond: 'M50 3 L97 50 L50 97 L3 50 Z',
  flag: 'M10 6 H90 V94 L50 76 L10 94 Z',
  pentagon: 'M8 8 H92 V56 L50 95 L8 56 Z',
  ball: 'M50 5 A45 45 0 1 1 49.99 5 Z',
};

const BADGE_COLORS = ['#E8B10C', '#B8C0C8', '#C27C3A'];

function Symbol({ id, ink, base }: { id: Logo['symbol']; ink: string; base: string }) {
  const emoji = LOGO_SYMBOLS.find((item) => item.id === id && 'emoji' in item) as { emoji?: string } | undefined;
  if (emoji?.emoji) {
    return (
      <text x="50" y="44" textAnchor="middle" fontSize="36" dominantBaseline="middle">
        {emoji.emoji}
      </text>
    );
  }
  switch (id) {
    case 'ball':
      return (
        <g>
          <circle cx="50" cy="44" r="15" fill={ink} />
          <path d="M41 33 C46 39 46 49 41 55 M59 33 C54 39 54 49 59 55" stroke={base} strokeWidth="2" fill="none" strokeDasharray="2 2" />
        </g>
      );
    case 'bats':
      return (
        <g fill={ink}>
          <rect x="47" y="24" width="6" height="40" rx="3" transform="rotate(-30 50 44)" />
          <rect x="47" y="24" width="6" height="40" rx="3" transform="rotate(30 50 44)" />
        </g>
      );
    case 'crown':
      return <path d="M32 56 L30 32 L41 42 L50 28 L59 42 L70 32 L68 56 Z" fill={ink} />;
    case 'star':
      return <path d="M50 26 L55.3 38.7 L69 39.8 L58.6 48.7 L61.8 62 L50 54.8 L38.2 62 L41.4 48.7 L31 39.8 L44.7 38.7 Z" fill={ink} />;
    case 'bolt':
      return <path d="M54 24 L36 48 H48 L44 64 L64 38 H52 Z" fill={ink} />;
    case 'flame':
      return <path d="M50 24 C58 34 66 40 64 51 C62 60 56 64 50 64 C44 64 37 60 36 51 C35 44 40 40 43 34 C44 40 47 43 50 43 C49 36 48 30 50 24 Z" fill={ink} />;
    default:
      return null;
  }
}

export function SquadLogo({
  logo,
  size = 64,
  badge,
  label,
}: {
  logo: Logo;
  size?: number;
  /** 주간 리그 순위(1~3) — 별 배지 */
  badge?: number | null;
  /** 읽어 주는 이름(없으면 장식으로 숨긴다) */
  label?: string;
}) {
  const base = colorHex(logo.primary);
  const ink = colorHex(logo.secondary);
  const initialsY = logo.frame === 'flag' ? 67 : logo.frame === 'diamond' ? 74 : 80;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0"
    >
      <path d={FRAMES[logo.frame]} fill={base} stroke={ink} strokeWidth="5" strokeLinejoin="round" />
      {logo.frame === 'ball' && (
        <path d="M22 18 C34 34 34 66 22 82 M78 18 C66 34 66 66 78 82" stroke={ink} strokeWidth="2.5" fill="none" strokeDasharray="4 3" />
      )}
      <Symbol id={logo.symbol} ink={ink} base={base} />
      <text
        x="50"
        y={initialsY}
        textAnchor="middle"
        fontSize={logo.initials.length > 2 ? 15 : 18}
        fontWeight="800"
        fill={ink}
        fontFamily="system-ui, sans-serif"
        letterSpacing="1"
      >
        {logo.initials}
      </text>
      {badge && badge >= 1 && badge <= 3 && (
        <path
          d="M84 2 L87.5 10.5 L96.5 11 L89.5 16.8 L91.8 25.5 L84 20.6 L76.2 25.5 L78.5 16.8 L71.5 11 L80.5 10.5 Z"
          fill={BADGE_COLORS[badge - 1]}
          stroke="#1A1A1A"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}
