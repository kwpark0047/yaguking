import tseslint from 'typescript-eslint';

/**
 * 09 문서 §5 단계 1-3의 요구사항:
 *  - src/server/** 와 DB 모듈을 클라이언트 컴포넌트에서 import하면 에러
 *  - src/lib/engine/** 은 순수 함수만. IO·DB·프레임워크 import 금지
 *
 * Next.js 전용 규칙(@next/eslint-plugin-next)은 화면 구현이 시작되는
 * 단계 6에서 추가한다.
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'supabase/.temp/**',
      // Firebase판은 별도 패키지다(자체 tsconfig·테스트). 이 설정으로 검사하지 않는다.
      'firebase-app/**',
    ],
  },

  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ── 서버 경계: 클라이언트로 내려가는 코드에서 비밀값 경로 차단 ──────────
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/server',
                '@/server/*',
                '@/lib/db',
                '@/lib/db/*',
                '@/lib/supabase/admin',
                'postgres',
              ],
              message:
                '서버 전용 모듈입니다. service_role 키와 DATABASE_URL이 클라이언트 번들에 포함될 수 있습니다. 라우트 핸들러나 서버 컴포넌트에서 호출하고 결과만 props로 전달하세요.',
            },
          ],
        },
      ],
    },
  },

  // ── 엔진 순수성: 판정 규칙의 단일 진실 공급원을 IO로부터 격리 ──────────
  {
    files: ['src/lib/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'react',
                'react-dom',
                'postgres',
                'zod',
                '@supabase/*',
                '@/server/*',
                '@/lib/db/*',
                '@/lib/supabase/*',
                'node:*',
                'fs',
                'path',
                'crypto',
              ],
              message:
                '판정 엔진은 순수 함수만 포함합니다. IO·DB·프레임워크 의존을 두지 마세요 (09 문서 §3.1).',
            },
          ],
        },
      ],
    },
  },

  // ── 테스트·CLI 스크립트: 표준 출력이 정상 동작이다 ────────────────────
  {
    files: ['tests/**/*.ts', 'scripts/**/*.{ts,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
);
