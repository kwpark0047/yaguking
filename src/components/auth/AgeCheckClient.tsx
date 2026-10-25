'use client';

import { useState } from 'react';
import { Mascot } from '@/components/brand/Mascot';
import { withFlag } from '@/lib/auth/returnTo';

type Phase = 'ask' | 'confirmUnder14' | 'deleted';

/**
 * 만 14세 이상 확인 화면.
 *
 * 생년월일을 받지 않는다 — 필요한 건 "14세 이상인가"뿐이고, 생년월일은 더
 * 많은 개인정보다. 미만이라고 답하면 한 번 더 묻고 계정을 지운다(되돌릴 수 없다).
 */
export function AgeCheckClient({ returnTo }: { returnTo: string }) {
  const [phase, setPhase] = useState<Phase>('ask');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(over14: boolean) {
    setPending(true);
    setError(null);
    const response = await fetch('/api/v1/me/age', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ over14 }),
    });
    const body = await response.json().catch(() => null);
    setPending(false);

    if (!body?.success) {
      setError(body?.error?.message ?? '처리하지 못했습니다. 다시 시도해 주세요.');
      return;
    }

    if (over14) {
      // 머리줄·테마가 회원 상태로 다시 그려지도록 새로 연다.
      window.location.href = body.data.claimed ? withFlag(returnTo, 'claimed', '1') : returnTo;
      return;
    }
    setPhase('deleted');
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4 py-8">
      <Mascot mood={phase === 'deleted' ? 'wink' : 'happy'} className="mx-auto h-32 w-32" />

      {error && (
        <p className="text-sm" style={{ color: 'var(--out)' }} role="alert">
          {error}
        </p>
      )}

      {phase === 'ask' && (
        <>
          <h1 className="font-cute text-3xl">만 14세 이상인가요?</h1>
          <p className="text-sm text-ink-2 break-keep">
            야구왕은 보호자 동의 절차가 아직 없어 만 14세 이상만 가입할 수 있어요. 생년월일은
            묻지 않아요.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => void answer(true)}
            className="squishy font-cute min-h-14 px-4 text-xl disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            네, 만 14세 이상이에요
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setPhase('confirmUnder14')}
            className="min-h-11 text-sm text-ink-2 underline"
          >
            아니요, 만 14세 미만이에요
          </button>
        </>
      )}

      {phase === 'confirmUnder14' && (
        <section aria-labelledby="under14-title" className="sticker flex flex-col gap-3 p-5">
          <h1 id="under14-title" className="font-cute text-2xl">
            지금은 가입할 수 없어요
          </h1>
          <p className="text-sm break-keep">
            계속하면 <strong>방금 로그인한 계정과 그 계정의 기록을 바로 지워요.</strong> 되돌릴
            수 없어요. 비회원으로는 계속 플레이할 수 있어요.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() => void answer(false)}
            className="min-h-14 rounded-option border-2 font-semibold disabled:opacity-60"
            style={{ borderColor: 'var(--out)', color: 'var(--out)' }}
          >
            {pending ? '지우는 중…' : '계정 지우기'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setPhase('ask')}
            className="min-h-11 text-sm text-ink-2 underline"
          >
            돌아가기
          </button>
        </section>
      )}

      {phase === 'deleted' && (
        <section aria-labelledby="deleted-title" className="flex flex-col gap-3" role="status">
          <h1 id="deleted-title" className="font-cute text-2xl">
            계정을 지웠어요
          </h1>
          <p className="text-sm text-ink-2 break-keep">
            만 14세가 되면 다시 가입해 주세요. 그때까지 비회원으로 즐길 수 있어요.
          </p>
          {/* 로그인 쿠키가 남아 있을 수 있어 새로 연다 */}
          <a
            href="/"
            className="squishy font-cute flex min-h-14 items-center justify-center px-4 text-xl"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            메인으로
          </a>
        </section>
      )}
    </main>
  );
}
