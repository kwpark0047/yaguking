'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatRate } from '@/lib/engine';
import type { BoxScore } from '@/lib/engine';

/**
 * G1 — 기록 저장 게이트 (06 문서 §7.2, 08 문서 §5.3).
 *
 * 규칙:
 *  - **카드이며 모달이 아니다.** 화면을 덮지 않고 닫을 수 있으며, 닫아도
 *    다른 모든 기능이 그대로 동작한다.
 *  - 추상적 권유 대신 **이 경기의 숫자를 그대로 쓴다**.
 *  - 박스스코어는 이미 위에 전부 공개되어 있다. 가입은 "저장"의 대가다.
 *
 * P1에서는 G1만 쓴다. G2(구단 기여)·G3(대결 전적)는 해당 기능과 함께 켠다.
 */
export function SignupGate({
  box,
  returnTo,
}: {
  box: BoxScore;
  returnTo: string;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return (
      <p className="text-xs text-ink-2">
        기록은 아직 임시 상태입니다.{' '}
        <Link
          href={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
          className="underline"
        >
          저장하기
        </Link>
      </p>
    );
  }

  const highlight = [
    box.h > 0 ? `${box.h}안타` : null,
    box.hr > 0 ? `${box.hr}홈런` : null,
    box.ab > 0 ? `타율 ${formatRate(box.avg)}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      className="relative rounded-card border p-4"
      style={{ borderColor: 'var(--accent)' }}
      aria-labelledby="signup-gate-heading"
    >
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="가입 안내 닫기"
        className="absolute right-2 top-2 flex size-11 items-center justify-center text-ink-2"
      >
        ✕
      </button>

      <h2 id="signup-gate-heading" className="pr-10 text-lg font-bold">
        아직 저장되지 않았습니다
      </h2>

      <p className="mt-2 text-sm break-keep">
        {highlight
          ? `${highlight}. 저장하면 통산 기록에 적립되고 다음에 이어서 쌓입니다.`
          : '이 타석들은 임시 기록입니다. 저장하면 통산 기록에 적립되고 다음에 이어서 쌓입니다.'}
      </p>

      <Link
        href={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        className="mt-3 flex min-h-14 items-center justify-center rounded-option px-4 font-semibold"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
      >
        3초 만에 저장하기
      </Link>

      <p className="mt-2 text-xs text-ink-2">
        카카오 · 구글 · 이메일 중 설정된 방법으로 로그인합니다.
      </p>
    </section>
  );
}
