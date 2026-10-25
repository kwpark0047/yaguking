import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AgeCheckClient } from '@/components/auth/AgeCheckClient';
import { sanitizeReturnTo, withFlag } from '@/lib/auth/returnTo';
import { getDb } from '@/lib/db/sql';
import { getAuthUserId } from '@/lib/supabase/server';
import { isAgeConfirmed } from '@/server/me/age';

export const metadata: Metadata = { title: '나이 확인 — 야구왕' };
export const dynamic = 'force-dynamic';

/**
 * 로그인 직후 만 14세 이상 확인 (src/server/me/age.ts, 15 문서 §3).
 * 이미 확인했으면 원래 가던 곳으로 보낸다.
 */
export default async function AgeCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const returnTo = sanitizeReturnTo((await searchParams).returnTo);
  const userId = await getAuthUserId();
  if (!userId) redirect(withFlag('/auth', 'returnTo', returnTo));
  if (await isAgeConfirmed(getDb(), userId)) redirect(returnTo);

  return <AgeCheckClient returnTo={returnTo} />;
}
