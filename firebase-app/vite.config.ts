/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * 야구왕 Firebase판 — 정적 사이트로만 빌드한다(Firebase Hosting Spark).
 * 서버 코드가 없으므로 Next.js 대신 Vite를 쓴다(16 문서 예정, 분석 보고 2026-10-26).
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 이 폴더는 기존 Next 앱 안에 있다. 비워 두면 Vite가 상위 폴더의
  // postcss.config.mjs(Next 앱용)를 찾아 쓰다가 실패한다. Tailwind는 위 플러그인이 맡는다.
  css: { postcss: {} },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Hosting 무료 전송량(하루 360 MB)을 아끼려고 화면 묶음 크기를 본다. Firestore SDK 묶음(약
    // 545 KB, 압축 158 KB)은 더 줄일 수 없어 그것을 쓰는 화면에 들어갈 때만 내려받는다(묶음 이름은
    // 처음 들어간 모듈 이름을 따라 meter-*.js가 된다). 이름을 붙여 따로 묶으면 첫 화면 묶음이 커져서
    // 그대로 둔다. 측정: npm run usage:transfer
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'node',
    // 규칙 테스트는 Firestore 에뮬레이터가 있을 때만 돈다(없으면 건너뜀) — npm run test:rules
    include: ['tests/unit/**/*.test.ts', 'tests/rules/**/*.test.ts'],
  },
});
