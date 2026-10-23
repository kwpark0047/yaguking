import { ImageResponse } from 'next/og';
import { getShareCard } from '@/server/share/shareCard';

/**
 * 공유 카드 OG 이미지 (08 문서 §5.5).
 *
 * 담는 것 — 닉네임, 등급, 득점, 타석, 타율, OPS
 * 담지 않는 것 — 이메일·실명, 플레이 시각, **문항 본문과 정답**
 *
 * 구단 로고·선수 사진·공식 컬러는 쓰지 않는다. 글자와 도형만으로 만든다.
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
  params: { sessionId: string };
}) {
  const card = await getShareCard(params.sessionId).catch(() => null);

  const nickname = card?.nickname ?? '야구왕';
  const levelName = card?.levelName ?? '';
  const runs = card?.runs ?? 0;
  const pa = card?.pa ?? 0;
  const avg = card?.avg ?? '-';
  const ops = card?.ops ?? '-';

  const text = `야구왕 득점 타석 타율 OPS ${nickname}${levelName}`;
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
          backgroundColor: '#0C1117',
          color: '#F2F5F7',
          padding: 64,
          fontFamily: font ? 'NotoSansKR' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 28, color: '#FFC53D' }}>야구왕</div>
          <div style={{ fontSize: 30, color: '#9AA6B2' }}>{levelName}</div>
          <div style={{ fontSize: 64 }}>{nickname}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 160, lineHeight: 1, color: '#FFC53D' }}>{runs}</div>
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
                  backgroundColor: '#10251A',
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
