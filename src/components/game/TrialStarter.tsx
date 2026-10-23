'use client';

import { useState } from 'react';
import { startPlaySession } from '@/lib/api/client';
import type { StartSessionDto } from '@/types/api';
import { PlayClient } from './PlayClient';

/**
 * 게스트 쿠키가 아직 없을 때의 대체 진입.
 *
 * 서버 컴포넌트는 쿠키를 설정할 수 없다. 보통은 `proxy.ts`가 같은 요청에서
 * 쿠키를 심어 주므로 서버에서 0탭 렌더가 되지만, 쿠키가 차단된 첫 방문 등에서는
 * 이 버튼이 대신 경기를 시작한다 (쿠키는 API 응답이 심는다).
 */
export function TrialStarter() {
  const [session, setSession] = useState<StartSessionDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) return <PlayClient initial={session} />;

  async function start() {
    setLoading(true);
    setError(null);
    const result = await startPlaySession('trial');
    setLoading(false);
    if (result.ok) setSession(result.data);
    else setError(result.message);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-bold">야구왕</h1>
      <p className="text-ink-2 break-keep">
        문제는 투구, 정답 속도는 타구, 오답은 아웃. 3아웃이면 1이닝이 끝나고
        박스스코어가 남습니다.
      </p>
      {error && (
        <p className="text-sm" style={{ color: 'var(--out)' }} role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={() => void start()}
        disabled={loading}
        className="min-h-14 rounded-option px-4 font-semibold disabled:opacity-60"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        {loading ? '준비 중…' : '바로 1이닝 시작'}
      </button>
      <p className="text-xs text-ink-2">
        로그인 없이 바로 플레이할 수 있습니다. 오늘 체험은 2이닝까지입니다.
      </p>
    </main>
  );
}
