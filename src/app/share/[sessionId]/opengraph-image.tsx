import { ImageResponse } from 'next/og';
import { teamTheme } from '@/lib/theme/teams';
import { teamThemesEnabled } from '@/lib/theme/themeSwitch';
import { tierTheme } from '@/lib/theme/tiers';
import { getShareCard } from '@/server/share/shareCard';

/**
 * 공유 카드 OG 이미지 (08 문서 §5.5).
 *
 * 담는 것 — 닉네임, 등급, 득점, 타석, 타율, OPS
 * 담지 않는 것 — 이메일·실명, 플레이 시각, **문항 본문과 정답**
 *
 * 구단 로고·선수 사진은 쓰지 않는다. 글자와 도형만으로 만든다.
 *
 * 색은 **기록을 만든 사람의** 구단 테마와 등급을 따른다. Satori는 CSS 변수와
 * 미디어 쿼리를 모르므로 다크 값을 직접 넣는다(카드는 어두운 배경이 기본이다).
 * 구단 테마가 꺼져 있으면() 브랜드 기본색으로 그린다.
 */
export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = '야구왕 경기 기록 카드';

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
  const tier = tierTheme(card?.level ?? 1).dark;
  const teamName = card?.teamShortName ?? '';

  const text = `야구왕 득점 타석 타율 OPS Lv. ${nickname}${levelName}${teamName}`;
  const font = await loadKoreanFont(text);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundImage: `linear-gradient(135deg, ${team.surface} 0%, ${team.surface} 55%, ${team.surfaceAlt} 100%)`,
          borderLeft: `12px solid ${team.accent}`,
          color: '#F2F5F7',
          padding: 64,
          fontFamily: font ? 'NotoSansKR' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 28, color: team.accent }}>야구왕</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 30 }}>
            <div
              style={{
                display: 'flex',
                backgroundColor: tier.color,
                // 명예의 전당은 웹 배지와 같이 무지개로. 글자색은 무지개 각 색과
                // 4.5:1을 확보한 진한 잉크다(tests/unit/theme/palette.test.ts).
                ...(tier.prism ? { backgroundImage: tier.prism } : {}),
                color: tier.prism ? '#101418' : tier.ink,
                borderRadius: 9999,
                padding: '4px 20px',
              }}
            >
              {levelName}
            </div>
            {teamName && <div style={{ color: '#9AA6B2' }}>{teamName}</div>}
          </div>
          <div style={{ fontSize: 64 }}>{nickname}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/*
              숫자를 **문자열로** 넘긴다. Satori는 0이 아닌 숫자 자식을 받으면
              "자식이 여럿인데 display:flex가 없다"며 실패한다(0과 문자열은 된다).
              기본값이 늘 0득점이라 드러나지 않았다.
            */}
            <div style={{ fontSize: 160, lineHeight: 1, color: team.accent }}>
              {String(runs)}
            </div>
            <div style={{ fontSize: 30, color: '#9AA6B2' }}>득점</div>
          </div>

          <div style={{ display: 'flex', gap: 16, marginLeft: 'auto' }}>
            {[
              ['타석', String(pa)],
              ['타율', avg],
              ['OPS', ops],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  backgroundColor: 'rgba(12, 17, 23, 0.55)',
                  borderRadius: 16,
                  padding: '20px 28px',
                }}
              >
                <div style={{ fontSize: 26, color: '#9AA6B2' }}>{label}</div>
                <div style={{ fontSize: 48 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
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
