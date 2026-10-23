'use client';

import { useState } from 'react';

/**
 * 공유 (08 문서 §5.5).
 *
 * 공유하는 주소는 **공개 요약 화면**(`/share/...`)이다. 결과 화면 자체는
 * 소유자만 볼 수 있으므로 그 주소를 공유하면 받은 사람이 막다른 길에 빠진다.
 *
 * Web Share API를 먼저 쓰고, 없으면 링크를 복사한다.
 */
export function ShareButton({ sessionId }: { sessionId: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function share() {
    const url = `${window.location.origin}/share/${sessionId}`;
    const title = '야구왕 — 내 1이닝 기록';

    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setMessage('링크를 복사했습니다.');
    } catch {
      // 사용자가 공유를 취소한 경우도 여기로 온다. 오류로 떠들지 않는다.
      setMessage(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-1">
      <button
        type="button"
        onClick={() => void share()}
        className="flex min-h-14 items-center justify-center rounded-option border px-4 font-semibold"
        style={{ borderColor: 'var(--line)' }}
      >
        공유
      </button>
      {message && (
        <p className="text-center text-xs text-ink-2" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
