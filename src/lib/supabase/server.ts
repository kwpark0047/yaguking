import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

/**
 * 서버에서 현재 로그인 사용자 id를 확인한다.
 *
 * 권한 판정에는 검증된 사용자 id만 쓴다. JWT의 user_metadata는 수정 가능하므로
 * 권한 판정에 사용하지 않는다 (01 문서 §7).
 *
 * Auth 공급자 설정이 아직 없으면 null을 돌려주고 호출자는 게스트로 처리한다.
 * 로그인·세션 갱신 흐름은 단계 7에서 완성한다.
 *
 * **요청 안에서 한 번만 확인한다**(`cache`). 회원이면 Supabase Auth로 네트워크
 * 요청이 나가는데, 루트 레이아웃(테마)과 페이지가 둘 다 부르므로 그대로 두면
 * 화면마다 두 번 나간다. 한 요청 안에서 로그인 상태가 바뀌는 경로(/auth/callback)는
 * 이 함수를 쓰지 않고 자체 클라이언트를 쓴다.
 */
export const getAuthUserId = cache(async function getAuthUserId(): Promise<string | null> {
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
});
