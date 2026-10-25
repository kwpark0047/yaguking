import { ApiError } from '@/lib/api/errors';
import type { Queryable } from '@/lib/db/types';
import { ensureProfile } from '@/server/me/profile';

/**
 * 만 14세 이상 확인 (개인정보처리방침 초안 §9, 15 문서 §3).
 *
 * 법정대리인 동의 절차가 없으므로 만 14세 미만의 가입을 받지 않는다. 생년월일은
 * 받지 않고 **확인한 시각만** 남긴다. 확인은 로그인 직후, 비회원 기록이 계정에
 * 붙기 전에 받는다(/welcome/age). 미만이라고 답하면 계정을 즉시 지운다.
 *
 * 확인 전 회원은 공식 경기를 시작하거나 비회원 기록을 승계할 수 없다 — 화면을
 * 건너뛰어도 기록이 쌓이지 않게 서버에서 막는다.
 */
export async function isAgeConfirmed(db: Queryable, userId: string): Promise<boolean> {
  const [row] = await db<{ confirmed: boolean }[]>`
    select age_confirmed_at is not null as confirmed
      from public.profiles
     where id = ${userId}
  `;
  return row?.confirmed ?? false;
}

export async function requireAgeConfirmed(db: Queryable, userId: string): Promise<void> {
  if (!(await isAgeConfirmed(db, userId))) throw new ApiError('AGE_CONFIRMATION_REQUIRED');
}

/** 만 14세 이상임을 기록한다. 프로필이 없으면 만든다. 이미 확인했으면 처음 시각을 둔다. */
export async function confirmAge(db: Queryable, userId: string): Promise<void> {
  await ensureProfile(db, userId);
  await db`
    update public.profiles
       set age_confirmed_at = coalesce(age_confirmed_at, now()),
           updated_at = now()
     where id = ${userId}
  `;
}

/** 확인 화면 주소. 확인 뒤 돌아갈 곳을 붙인다. */
export function ageCheckPath(returnTo: string): string {
  return `/welcome/age?returnTo=${encodeURIComponent(returnTo)}`;
}
