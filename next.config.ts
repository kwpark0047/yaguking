import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 게임 API는 캐시 금지. 라우트 핸들러에서 개별적으로 force-dynamic / no-store를 선언한다.
  poweredByHeader: false,
  experimental: {
    // service_role 키와 DATABASE_URL이 클라이언트 번들로 새는 것을 빌드 단계에서 차단
    typedEnv: false,
  },
};

export default nextConfig;
