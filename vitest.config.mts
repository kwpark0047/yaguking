import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    /**
     * 통합 테스트는 같은 DB를 공유하고 각 파일이 cleanup()으로 테이블을 비운다.
     * 파일을 병렬로 돌리면 서로의 픽스처를 지워 엉뚱한 실패가 난다.
     * 단위 테스트는 1초 미만이라 순차 실행 비용이 사실상 없다.
     */
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      // 판정 엔진은 순수 함수이므로 100%를 목표로 한다 (09 문서 §6 c).
      include: ['src/lib/engine/**/*.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
