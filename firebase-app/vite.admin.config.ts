import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * 관리자 사이트(docs/admin-plan.md) — 이용자 앱과 **따로 빌드**해 두 번째 Hosting 사이트로 올린다.
 * 이용자 앱 묶음(dist)에 관리자 코드가 섞이지 않는다(배포 전 점검이 확인). src/와 화면 토큰은 함께 쓴다.
 *   개발: npm run admin:dev (5175)   빌드: npm run admin:build → dist-admin/
 */
const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('./admin', import.meta.url)),
  envDir: root,
  publicDir: false,
  plugins: [react(), tailwindcss()],
  css: { postcss: {} },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist-admin', import.meta.url)),
    emptyOutDir: true,
    // 관리자 한 명이 쓰는 별도 사이트라 Auth·Firestore를 한 묶음(약 290 KB 압축)으로 둔다 — 이용자 전송량과 무관
    chunkSizeWarningLimit: 1000,
  },
  server: { port: 5175, strictPort: true },
});
