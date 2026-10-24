import type { MetadataRoute } from 'next';
import { indexingAllowed } from '@/lib/seo/indexing';

export const dynamic = 'force-dynamic';

/**
 * robots.txt.
 *
 * 기본은 전면 차단이다 (11 문서 §3). `SEARCH_INDEXING=allow`일 때만 열린다.
 *
 * robots.txt만으로는 색인을 확실히 막지 못한다 — 크롤링을 막을 뿐이라,
 * 외부 링크를 타고 들어온 URL은 본문 없이 색인될 수 있다. 그래서
 * 레이아웃 메타데이터의 `noindex`와 **함께** 쓴다.
 */
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // 경기·결과·공유 URL은 1회성이라 색인할 가치가 없다.
        disallow: ['/api/', '/admin/', '/auth/', '/play/', '/settings'],
      },
    ],
  };
}
