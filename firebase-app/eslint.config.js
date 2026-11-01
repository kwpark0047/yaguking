// 코드 검사(2026-11-01) — 타입 검사(tsc)가 못 잡는 것만: 훅 규칙, 놓친 await(Promise), 위험한 습관.
// 쓰지 않는 변수 등은 tsconfig(noUnusedLocals)가 이미 막는다.
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-admin', 'node_modules', 'playwright-report', 'test-results', 'src/content/questions.generated.json'] },
  {
    files: ['src/**/*.{ts,tsx}', 'admin/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['ops/**/*.mjs', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: { eqeqeq: ['error', 'always', { null: 'ignore' }] },
  },
);
