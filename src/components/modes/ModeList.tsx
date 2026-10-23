'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { startPlaySession } from '@/lib/api/client';

/**
 * 모드 목록.
 *
 * 시작 전에 **길이 · 공식 집계 여부 · 보상**을 밝힌다. 공식 여부를 모르고
 * 플레이하면 "왜 내 기록이 안 올라가지"가 된다 (08 문서 V07).
 */
const MODES = [
  {
    mode: 'official_3' as const,
    title: '공식 3이닝',
    detail: '아웃 9개까지 · 공식 집계 · XP 적립',
    official: true,
  },
  {
    mode: 'daily' as const,
    title: '오늘의 야구',
    detail: '1이닝 · 공식 집계 · 하루 1회 추가 XP',
    official: true,
  },
  {
    mode: 'full_9' as const,
    title: '풀게임 9이닝',
    detail: '약 10분 · 공식 집계',
    official: true,
  },
  {
    mode: 'trial' as const,
    title: '체험 1이닝',
    detail: '아웃 3개까지 · 공식 집계 없음',
    official: false,
  },
];

export function ModeList() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(mode: (typeof MODES)[number]['mode']) {
    setPending(mode);
    setError(null);
    const result = await startPlaySession(mode);
    setPending(null);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push(`/play/${result.data.sessionId}`);
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="text-sm" style={{ color: 'var(--out)' }} role="alert">
          {error}
        </p>
      )}

      {MODES.map((item) => (
        <button
          key={item.mode}
          type="button"
          disabled={pending !== null}
          onClick={() => void start(item.mode)}
          className="flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-card border p-4 text-left disabled:opacity-60"
          style={{ borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' }}
        >
          <span className="flex items-center gap-2 font-semibold">
            {item.title}
            {item.official && (
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ backgroundColor: 'var(--bg-field)', color: 'var(--on-base)' }}
              >
                공식
              </span>
            )}
          </span>
          <span className="text-xs text-ink-2">{item.detail}</span>
          <span className="text-xs text-ink-2">문항당 15초</span>
        </button>
      ))}

      <p className="mt-2 text-xs text-ink-2">
        약점 코스 훈련과 고스트 대결은 P2에서 열립니다.
      </p>
    </div>
  );
}
