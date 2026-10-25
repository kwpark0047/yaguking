import { ImageResponse } from 'next/og';
import { SURFACES } from '@/lib/theme/base';
import { MATERIAL_INLAY, cardInitial, materialFill, mixHex } from '@/lib/theme/material';
import { teamTheme } from '@/lib/theme/teams';
import { teamThemesEnabled } from '@/lib/theme/themeSwitch';
import { tierTheme } from '@/lib/theme/tiers';
import { getShareCard } from '@/server/share/shareCard';

/**
 * 공유 카드 OG 이미지 (08 문서 §5.5).
 *
 * 담는 것 — 닉네임, 등급, 득점, 타석, 타율, OPS. 오른쪽에 웹과 같은 선수 카드를
 * 얹는다(14 문서 §5.1). 소재는 그라데이션으로만 흉내 낸다(src/lib/theme/material.ts).
 * 담지 않는 것 — 이메일·실명, 플레이 시각, **문항 본문과 정답**
 *
 * 구단 로고·선수 사진은 쓰지 않는다. 글자와 도형만으로 만든다. 카드 가운데
 * 큰 글자는 닉네임 첫 글자다(구단 이니셜이 아니다).
 *
 * 색은 **기록을 만든 사람의** 구단 테마와 등급을 따른다. Satori는 CSS 변수와
 * 미디어 쿼리를 모르므로 다크 값을 직접 넣는다(카드는 어두운 배경이 기본이다).
 * 구단 테마가 꺼져 있으면(`TEAM_THEMES=off`) 브랜드 기본색으로 그린다.
 */
export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = '야구왕 선수 카드';

/** 선수 카드 크기. 실물 트레이딩 카드와 같은 5:7 */
const CARD_WIDTH = 384;
const CARD_HEIGHT = 538;

/**
 * 한국어 글꼴을 구해 온다.
 *
 * Satori는 WOFF2를 읽지 못하므로 **User-Agent를 보내지 않아** Google Fonts가
 * TTF를 내려주게 한다. `text` 파라미터로 쓰인 글자만 받아 용량을 줄인다.
 * 실패하면 null을 돌려주고 기본 글꼴로 그린다(한글이 깨질 수 있다).
 */
async function loadKoreanFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700&text=${encodeURIComponent(text)}`;
    const css = await fetch(cssUrl).then((response) => response.text());
    const fontUrl = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!fontUrl) return null;
    return await fetch(fontUrl).then((response) => response.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image({
  params,
}: {
  /**
   * Next 16에서 `params`는 Promise다(문서: opengraph-image.md §params).
   * 예전에는 동기 객체로 읽어 `sessionId`가 늘 undefined였고, 그래서 공유 링크
   * 미리보기는 **실제 기록이 아니라 기본값("야구왕 · 0득점")만** 그려 왔다.
   */
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const card = await getShareCard(sessionId).catch(() => null);

  const nickname = card?.nickname ?? '야구왕';
  const levelName = card?.levelName ?? '';
  const runs = card?.runs ?? 0;
  const pa = card?.pa ?? 0;
  const avg = card?.avg ?? '-';
  const ops = card?.ops ?? '-';

  const team = teamTheme(teamThemesEnabled() ? card?.teamSlug : null).dark;
  const tierInfo = tierTheme(card?.level ?? 1);
  const tier = tierInfo.dark;
  const surface = SURFACES.default.dark;
  const teamName = card?.teamShortName ?? '';
  const initial = cardInitial(nickname);
  const material = materialFill(tierInfo.material, tier.color, surface);
  const inlay = MATERIAL_INLAY[tierInfo.material];
  const unranked = tierInfo.ornament === 'none';

  const text = `야구왕 득점 타석 타율 OPS Lv.0123456789 의 이닝 로그인 없이 바로 플레이 ${nickname}${levelName}${teamName}${initial}`;
  const font = await loadKoreanFont(text);

  // 웹 카드와 같은 세 겹: 등급 테두리 › 소재 › 단색 면 (globals.css `.player-card`)
  const frame = tier.prism
    ? // Satori에는 border-image가 없다. 바깥 면을 무지개로 칠하고 안쪽으로 덮는다.
      { backgroundImage: tier.prism, padding: 4 }
    : tierInfo.ornament === 'frame' || tierInfo.ornament === 'glow'
      ? { border: `4px solid ${tier.color}` }
      : { border: `2px solid ${surface.line}` };
  const glow =
    tierInfo.ornament === 'glow' || tier.prism ? { boxShadow: `0 0 36px ${tier.color}66` } : {};

  const rivet = (position: { left?: number; right?: number; top?: number; bottom?: number }) => (
    <div
      style={{
        position: 'absolute',
        ...position,
        width: 10,
        height: 10,
        borderRadius: 9999,
        backgroundColor: tier.color,
      }}
    />
  );

  const stats = [
    ['득점', String(runs)],
    ['타석', String(pa)],
    ['타율', avg],
    ['OPS', ops],
  ];

  const playerCard = (
    <div
      style={{
        display: 'flex',
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 24,
        ...frame,
        ...glow,
      }}
    >
      <div
        style={{
          display: 'flex',
          position: 'relative',
          flex: 1,
          padding: 16,
          borderRadius: 20,
          backgroundColor: material.backgroundColor,
          backgroundImage: material.backgroundImage,
        }}
      >
        {tierInfo.material === 'kraft' && rivet({ left: 24, top: 3 })}
        {tierInfo.material === 'kraft' && rivet({ right: 24, top: 3 })}
        {tierInfo.material === 'kraft' && rivet({ left: 24, bottom: 3 })}
        {tierInfo.material === 'kraft' && rivet({ right: 24, bottom: 3 })}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            gap: 14,
            padding: 16,
            borderRadius: 14,
            backgroundColor: surface.bgCard,
            // 실밥(dashed)은 금박에 묻히지 않게 바탕색 쪽으로 당긴다(웹과 같다)
            ...(inlay === 'none'
              ? {}
              : {
                  border: `2px ${inlay} ${inlay === 'dashed' ? mixHex(surface.bgBase, tier.color, 0.6) : tier.color}`,
                }),
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                borderRadius: 9999,
                padding: '2px 14px',
                // 육성선수는 외곽선 배지, 명예의 전당은 무지개 — 웹 배지와 같다.
                // 무지개 위 글자는 각 색과 4.5:1인 진한 잉크다(tests/unit/theme/palette.test.ts).
                ...(unranked
                  ? { border: `1px solid ${tier.color}`, color: tier.color }
                  : {
                      backgroundColor: tier.color,
                      ...(tier.prism ? { backgroundImage: tier.prism } : {}),
                      color: tier.prism ? '#101418' : tier.ink,
                    }),
              }}
            >
              {`Lv.${tierInfo.level} ${levelName}`}
            </div>
            {teamName && <div style={{ color: surface.ink2 }}>{teamName}</div>}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: 12,
              borderRadius: 12,
              borderLeft: `6px solid ${team.accent}`,
              backgroundImage: `linear-gradient(135deg, ${team.surface} 0%, ${team.surface} 55%, ${team.surfaceAlt} 100%)`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 104,
                height: 104,
                borderRadius: 14,
                border: `3px solid ${tier.color}`,
                fontSize: 64,
                lineHeight: 1,
              }}
            >
              {initial}
            </div>
            <div style={{ fontSize: 34 }}>{nickname}</div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {stats.map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: 144,
                  padding: '6px 12px',
                  borderRadius: 10,
                  backgroundColor: surface.bgBase,
                }}
              >
                <div style={{ fontSize: 16, color: surface.ink2 }}>{label}</div>
                <div style={{ fontSize: 28 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundImage: `linear-gradient(135deg, ${team.surface} 0%, ${team.surface} 55%, ${team.surfaceAlt} 100%)`,
          borderLeft: `12px solid ${team.accent}`,
          color: surface.ink1,
          padding: '40px 72px 40px 64px',
          fontFamily: font ? 'NotoSansKR' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 580 }}>
          <div style={{ fontSize: 30, color: team.accent }}>야구왕</div>
          <div style={{ fontSize: 52 }}>{`${nickname}의 1이닝`}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginTop: 12 }}>
            {/*
              숫자를 **문자열로** 넘긴다. Satori는 0이 아닌 숫자 자식을 받으면
              "자식이 여럿인데 display:flex가 없다"며 실패한다(0과 문자열은 된다).
              기본값이 늘 0득점이라 드러나지 않았다.
            */}
            <div style={{ fontSize: 168, lineHeight: 1, color: team.accent }}>
              {String(runs)}
            </div>
            <div style={{ fontSize: 34, color: surface.ink2, paddingBottom: 16 }}>득점</div>
          </div>
          <div style={{ fontSize: 26, color: surface.ink2, marginTop: 16 }}>
            로그인 없이 바로 플레이
          </div>
        </div>

        {playerCard}
      </div>
    ),
    {
      ...size,
      ...(font
        ? { fonts: [{ name: 'NotoSansKR', data: font, style: 'normal', weight: 700 }] }
        : {}),
    },
  );
}
