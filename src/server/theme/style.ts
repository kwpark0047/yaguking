import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { cache } from 'react';
import { parseStylePreference, STYLE_COOKIE, type StylePreference } from '@/lib/theme/style';

/**
 * 이 요청의 화면 스타일 선택값. 쿠키에서 읽는다(서버 DB에는 남기지 않는다).
 *
 * 레이아웃·뷰포트·설정 화면이 같이 쓰므로 요청 안에서 한 번만 읽는다.
 * 쿠키를 못 읽으면 auto로 떨어진다. 단 Next 내부 신호(정적 생성 중 "이 화면은
 * 동적이다")는 삼키지 않는다 — 테마 조회에서 한 번 그 실수를 했다.
 */
export const getStylePreference = cache(async (): Promise<StylePreference> => {
  try {
    const store = await cookies();
    return parseStylePreference(store.get(STYLE_COOKIE)?.value);
  } catch (error) {
    unstable_rethrow(error);
    return 'auto';
  }
});
