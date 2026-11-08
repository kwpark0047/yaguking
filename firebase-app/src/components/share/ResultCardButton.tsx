import { useState } from 'react';
import { canShareImage, shareImage } from '@/lib/platform/share';
import { drawResultCard, type ResultCard } from '@/lib/share/resultCard';

/**
 * 결과 카드 이미지(docs/signup-boost.md G2) — 누르면 기기에서 그려 공유 창을 열고, 공유 창이 파일을 못 받으면 내려받는다.
 * 미니앱판은 이미지 공유를 쓰지 않아 단추가 보이지 않는다(src/toss/share.ts).
 */
export function ResultCardButton({ card, fileName }: { card: ResultCard; fileName: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!canShareImage()) return null;

  async function run() {
    setBusy(true);
    setStatus(null);
    try {
      const blob = await drawResultCard(card);
      if (!blob) return setStatus('이 브라우저에서는 카드를 만들 수 없어요.');
      const outcome = await shareImage(blob, fileName, `${card.headline} · ${card.summary}\n${card.url}`);
      if (outcome === 'downloaded') setStatus('결과 카드를 내려받았어요. 사진처럼 보내 보세요.');
      if (outcome === 'failed') setStatus('카드를 보내지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="flex min-h-12 flex-1 items-center justify-center rounded-option border-2 font-semibold"
        style={{ borderColor: 'var(--line)' }}
      >
        결과 카드 공유
      </button>
      {status && (
        <p role="status" className="w-full text-sm">
          {status}
        </p>
      )}
    </>
  );
}
