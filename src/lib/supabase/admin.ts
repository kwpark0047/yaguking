import { createClient } from '@supabase/supabase-js';

/**
 * service_role 클라이언트.
 *
 * **RLS를 우회한다.** 반드시 서버에서만 쓴다 — eslint가 클라이언트
 * 컴포넌트에서의 import를 막고, security-check 가 번들 유입을 검사한다.
 *
 * 지금은 계정 삭제(auth.admin.deleteUser)에만 쓴다. 인증 세션·리프레시
 * 토큰까지 함께 정리되어야 하므로 DB 행을 직접 지우지 않고 이 경로를 쓴다.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY 또는 NEXT_PUBLIC_SUPABASE_URL이 없습니다.',
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
