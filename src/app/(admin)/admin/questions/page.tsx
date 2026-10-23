import { redirect } from 'next/navigation';
import { AdminQuestionsClient } from '@/components/admin/AdminQuestionsClient';
import { getAuthUserId } from '@/lib/supabase/server';

/**
 * V19 운영 콘솔 최소본.
 *
 * 권한은 서버에서 DB로 확인한다. 이 화면은 입구일 뿐이고, 모든 API가
 * 다시 `assertAdmin`을 통과해야 한다 — 화면 접근 제어만으로는 막지 못한다.
 */
export const dynamic = 'force-dynamic';

export default async function AdminQuestionsPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect('/auth?returnTo=/admin/questions');

  return <AdminQuestionsClient />;
}
