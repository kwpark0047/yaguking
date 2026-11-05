import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * 앱인토스 미니앱판(docs/toss-miniapp.md) — 이용자 앱·관리자 사이트와 **따로 빌드**한다. 게임 화면·문제은행은 src/를 함께 쓰고,
 * 앱인토스 정책에 걸리는 부분만 아래 별칭으로 바꿔 끼운다(웹판 묶음에는 토스 코드가 들어가지 않는다).
 *   개발: npm run toss:dev (5176)   빌드: npm run toss:build → dist-toss/ → yaguking.ait
 */
const src = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));
const swap = (module: string, replacement: string) => ({
  find: new RegExp(`^@/${module.replaceAll('/', '\\/')}$`),
  replacement: src(replacement),
});

export default defineConfig({
  root: fileURLToPath(new URL('./toss', import.meta.url)),
  envDir: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false, // 서비스 워커·매니페스트(홈 화면 설치)를 넣지 않는다
  plugins: [react(), tailwindcss()],
  css: { postcss: {} },
  resolve: {
    alias: [
      swap('lib/firebase/auth', 'toss/firebaseAuth.ts'), // 구글 로그인용 숨은 iframe을 띄우지 않는다
      swap('lib/platform/share', 'toss/share.ts'), // 공유는 토스 공유 시트·intoss:// 링크로
      swap('lib/platform/features', 'toss/features.ts'), // 가입·회원 전용 기능 없음
      swap('components/ads/AdSlot', 'toss/NoAd.tsx'), // 자체 광고 금지 — 앱인토스 광고만 허용
      swap('components/layout/SiteHeader', 'toss/TossHeader.tsx'), // 로그인·가입·즐겨찾기 없음
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL('./dist-toss', import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
  },
  server: { port: 5176, strictPort: true },
});
