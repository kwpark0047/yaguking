import { FLOODLIGHT_CORE, FLOODLIGHTS, HAZE, SKY_ASPECT, SKY_VIEWBOX, TWINKLE_GROUPS } from '@/lib/home/heroSky';

/**
 * 메인 히어로 바탕 위 움직임 층(src/lib/home/heroSky.ts). 장식이라 화면 읽기에서 숨기고 누를 수 없다.
 * 층마다 svg 하나 — CSS가 층 전체의 투명도·위치만 움직인다(globals.css `.hero-sky`).
 */
export function HeroSky() {
  return (
    <div className="hero-sky" aria-hidden="true">
      <svg className="hero-sky__haze" viewBox={SKY_VIEWBOX} preserveAspectRatio={SKY_ASPECT} focusable="false">
        <defs>
          <radialGradient id="yk-hero-haze">
            <stop offset="0" stopColor="#d6e4ff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#d6e4ff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx={HAZE.x} cy={HAZE.y} rx={HAZE.rx} ry={HAZE.ry} fill="url(#yk-hero-haze)" />
      </svg>
      <svg className="hero-sky__lights" viewBox={SKY_VIEWBOX} preserveAspectRatio={SKY_ASPECT} focusable="false">
        <defs>
          <radialGradient id="yk-hero-core">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="0.5" stopColor="#e3edff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#e3edff" stopOpacity="0" />
          </radialGradient>
        </defs>
        {FLOODLIGHTS.map((light) => (
          <circle key={light.x} cx={light.x} cy={light.y} r={light.r * FLOODLIGHT_CORE} fill="url(#yk-hero-core)" />
        ))}
      </svg>
      {TWINKLE_GROUPS.map((stars, group) => (
        <svg
          key={group}
          className={`hero-sky__stars hero-sky__stars--${group + 1}`}
          viewBox={SKY_VIEWBOX}
          preserveAspectRatio={SKY_ASPECT}
          focusable="false"
        >
          <g fill="#eef4ff">
            {stars.map((star) => (
              <circle key={`${star.x}-${star.y}`} cx={star.x} cy={star.y} r={star.r} />
            ))}
          </g>
        </svg>
      ))}
    </div>
  );
}
