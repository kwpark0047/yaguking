/**
 * 결과 카드 이미지(docs/signup-boost.md G2) — 기기에서 그린다(서버·외부 서비스 없음). 구단 로고는 쓰지 않는다(상표).
 * 색은 지금 화면의 테마 색(내 구단 테마면 구단 색)을 그대로 쓴다.
 */
export interface ResultCard {
  /** 큰 제목 — "4득점" */
  headline: string;
  /** 한 줄 요약 — "3안타 1홈런 · 1아웃" */
  summary: string;
  /** 타석 이모지 줄 — "🟩🟩🟥" */
  emoji: string;
  /** 위 작은 글 — "개인 경기 · 11월 8일" */
  label: string;
  /** 아래 주소 */
  url: string;
}

export const CARD_SIZE = { width: 1080, height: 1080 };

/** 박스스코어에서 요약 글을 만든다(그리기와 따로 — 테스트가 이것만 본다) */
export function cardSummary(box: { h: number; hr: number; bb: number; so: number }): string {
  const parts = [box.h > 0 && `${box.h}안타`, box.hr > 0 && `${box.hr}홈런`, box.bb > 0 && `${box.bb}볼넷`, box.so > 0 && `${box.so}아웃`].filter(Boolean);
  return parts.join(' · ') || '기록 없음';
}

function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** PNG 한 장. 그리지 못하면(캔버스 없음) null */
export async function drawResultCard(card: ResultCard): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE.width;
  canvas.height = CARD_SIZE.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const background = themeColor('--bg-base', '#0b1a2e');
  const accent = themeColor('--accent', '#f2c14e');
  const ink = themeColor('--ink-1', '#ffffff');
  const font = '"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif';
  const center = CARD_SIZE.width / 2;

  context.fillStyle = background;
  context.fillRect(0, 0, CARD_SIZE.width, CARD_SIZE.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, CARD_SIZE.width, 24);
  context.fillRect(0, CARD_SIZE.height - 24, CARD_SIZE.width, 24);

  context.textAlign = 'center';
  context.fillStyle = accent;
  context.font = `800 72px ${font}`;
  context.fillText('야구왕', center, 170);
  context.fillStyle = ink;
  context.font = `500 40px ${font}`;
  context.fillText(card.label, center, 240);

  context.font = `800 180px ${font}`;
  context.fillStyle = accent;
  context.fillText(card.headline, center, 500);
  context.fillStyle = ink;
  context.font = `600 56px ${font}`;
  context.fillText(card.summary, center, 600);
  context.font = `80px ${font}`;
  context.fillText(card.emoji, center, 730);

  context.font = `500 36px ${font}`;
  context.fillText('야구 상식 퀴즈 — 빨리 맞히면 홈런', center, 880);
  context.fillStyle = accent;
  context.font = `700 40px ${font}`;
  context.fillText(card.url, center, 950);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
