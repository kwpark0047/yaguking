/**
 * 야구왕 캐릭터 — 헬멧 쓴 야구공 타자 (14 문서 §5.3의 임시 버전, 2026-10-26 개정).
 *
 * 사용자가 준 참고 그림의 **방향만** 가져왔다: 야구공 얼굴, 자신감 있는 표정,
 * 타자 헬멧, 방망이와 글러브, 발밑의 물결. 참고 그림의 헬멧 문양(호랑이·영문
 * 이니셜)과 깃발(용·"K", 태극 배색), 그림 속 글자는 **쓰지 않는다** — 특정 구단의
 * 표지나 국가 상징으로 읽히기 때문이다(14 문서 §2, §11). 헬멧 문양은 우리 이름
 * "야구왕"에서 온 왕관이다.
 *
 * 헬멧 색은 보는 사람의 강조색(구단 테마)을 따르지만 글자·로고는 넣지 않는다.
 * 장식이다. 옆에 늘 글자가 있으므로 낭독에서 뺀다. 고대비·움직임 줄이기에서는
 * 움직이지 않는다(globals.css `.mascot`).
 */
export function Mascot({
  className,
  mood = 'happy',
}: {
  className?: string;
  mood?: 'happy' | 'wink';
}) {
  return (
    <svg
      viewBox="0 0 240 222"
      aria-hidden="true"
      focusable="false"
      className={['mascot', className].filter(Boolean).join(' ')}
    >
      {/* 발밑 물결 */}
      <path
        d="M8 206 Q38 176 68 194 Q94 160 124 188 Q156 158 186 190 Q212 172 234 202 L234 222 L8 222 Z"
        className="mascot__wave"
      />
      <path
        d="M8 214 Q44 194 78 208 Q110 188 140 207 Q172 190 200 207 Q220 198 234 210 L234 222 L8 222 Z"
        className="mascot__wave-front"
      />
      <path d="M58 192 q9 -12 20 -3" className="mascot__foam" />
      <path d="M116 186 q9 -12 20 -3" className="mascot__foam" />
      <path d="M176 188 q9 -12 20 -3" className="mascot__foam" />

      <g className="mascot__body">
        {/* 방망이 — 몸 뒤로, 손을 축으로 살짝 흔든다 */}
        <g className="mascot__bat">
          <path d="M84 150 L32 64" className="mascot__bat-barrel" />
          <path d="M62 114 L32 64" className="mascot__bat-barrel-tip" />
          <path d="M56 102 L36 68" className="mascot__bat-shine" />
          <path d="M84 150 L68 124" className="mascot__bat-grip" />
        </g>

        {/* 공 */}
        <circle cx="125" cy="124" r="60" className="mascot__ball" />
        <path d="M80 96 Q98 128 84 170" className="mascot__seam" />
        <path d="M170 96 Q152 128 166 170" className="mascot__seam" />
        <path d="M80 96 Q98 128 84 170" className="mascot__stitch" />
        <path d="M170 96 Q152 128 166 170" className="mascot__stitch" />

        {/* 방망이를 쥔 손 — 공 앞에 와야 쥔 것처럼 보인다 */}
        <circle cx="80" cy="152" r="13" className="mascot__fist" />
        <path d="M74 148 q6 -4 12 0" className="mascot__fist-line" />

        {/* 헬멧 */}
        <path d="M64 110 Q62 48 125 46 Q188 48 186 110 Q125 98 64 110 Z" className="mascot__helmet" />
        <path
          d="M176 96 Q202 100 200 130 Q198 148 178 148 Q170 130 176 96 Z"
          className="mascot__helmet"
        />
        <circle cx="187" cy="125" r="5" className="mascot__visor" />
        <path
          d="M56 108 Q125 90 194 108 Q198 118 188 120 Q125 106 62 120 Q52 118 56 108 Z"
          className="mascot__visor"
        />
        <path d="M86 72 Q102 56 124 54" className="mascot__helmet-shine" />
        <path
          d="M108 86 L106 66 L116 76 L125 62 L134 76 L144 66 L142 86 Z"
          className="mascot__crown"
        />

        {/* 얼굴 */}
        <path d="M92 120 L114 127" className="mascot__brow" />
        <path d="M158 120 L136 127" className="mascot__brow" />
        <g className="mascot__eyes">
          <ellipse cx="104" cy="139" rx="10" ry="12" className="mascot__eye-white" />
          <circle cx="106" cy="141" r="7" className="mascot__iris" />
          <circle cx="106" cy="141" r="3.5" className="mascot__pupil" />
          <circle cx="108.5" cy="137" r="2.5" className="mascot__glint" />
          {mood === 'wink' ? (
            <path d="M136 141 Q146 133 156 141" className="mascot__wink" />
          ) : (
            <>
              <ellipse cx="146" cy="139" rx="10" ry="12" className="mascot__eye-white" />
              <circle cx="144" cy="141" r="7" className="mascot__iris" />
              <circle cx="144" cy="141" r="3.5" className="mascot__pupil" />
              <circle cx="146.5" cy="137" r="2.5" className="mascot__glint" />
            </>
          )}
        </g>
        <path d="M125 149 q3 3 0 6" className="mascot__nose" />
        <ellipse cx="91" cy="156" rx="8" ry="4.5" className="mascot__cheek" />
        <ellipse cx="159" cy="156" rx="8" ry="4.5" className="mascot__cheek" />
        <path d="M112 162 Q127 169 141 157" className="mascot__mouth" />

        {/* 글러브 */}
        <path
          d="M168 130 Q196 116 214 140 Q226 162 210 184 Q190 198 172 184 Q160 168 168 130 Z"
          className="mascot__glove"
        />
        <path d="M176 142 L204 138" className="mascot__lace" />
        <path d="M174 156 L208 154" className="mascot__lace" />
        <path d="M178 170 L204 172" className="mascot__lace" />
      </g>
    </svg>
  );
}
