import Link from 'next/link';
import { formatRate } from '@/lib/engine';
import type { CareerBattingDto } from '@/types/api';

/**
 * 승계 직후 피드백 (06 문서 §7.3).
 *
 * 가입의 보상을 **1초 안에 체감**시켜야 한다. "가입 완료" 같은 중립적인
 * 문구 대신 방금 적립된 숫자를 보여준다.
 */
export function ClaimedBanner({
  career,
  onboardingPending,
  returnTo,
}: {
  career: CareerBattingDto | null;
  onboardingPending: boolean;
  returnTo: string;
}) {
  return (
    <section
      className="rounded-card border p-4"
      style={{ borderColor: 'var(--on-base)' }}
      role="status"
    >
      <p className="flex items-center gap-2 font-semibold" style={{ color: 'var(--on-base)' }}>
        <span aria-hidden="true">✓</span>
        기록이 통산에 적립되었습니다
      </p>

      {career && career.pa > 0 && (
        <p className="num-tabular mt-1 text-sm text-ink-2">
          통산 {career.pa}타석 {career.ab}타수 {career.h}안타
          {career.hr > 0 && ` ${career.hr}홈런`} — 타율 {formatRate(career.avg)}
        </p>
      )}

      {onboardingPending && (
        <Link
          href={`/onboarding?returnTo=${encodeURIComponent(returnTo)}`}
          className="mt-3 flex min-h-14 items-center justify-center rounded-option px-4 font-semibold"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          대표 구단 고르기
        </Link>
      )}
    </section>
  );
}
