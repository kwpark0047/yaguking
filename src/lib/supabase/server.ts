import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * 서버에서 현재 로그인 사용자 id를 확인한다.
 *
 * 권한 판정에는 검증된 사용자 id만 쓴다. JWT의 user_metadata는 수정 가능하므로
 * 권한 판정에 사용하지 않는다 (01 문서 §7).
 *
 * Auth 공급자 설정이 아직 없으면 null을 돌려주고 호출자는 게스트로 처리한다.
 * 로그인·세션 갱신 흐름은 단계 7에서 완성한다.
 */
export async function getAuthUserId(): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // 라우트 핸들러에서는 세션 갱신 쿠키를 쓰지 않는다. 갱신은 미들웨어가 맡는다.
      setAll: () => {},
    },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}
