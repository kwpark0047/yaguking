/** predeploy-check.mjs의 형(단위 테스트가 TypeScript에서 불러온다) */
export const REQUIRED_ENV: readonly string[];
export const FORBIDDEN: readonly (readonly [string, RegExp])[];
export function checkTarget(project: string | undefined, env: Record<string, string | undefined>): string[];
export function checkDist(files: readonly { path: string; text: string | null }[]): string[];
export function loadEnv(dir: string, processEnv?: Record<string, string | undefined>): Record<string, string>;
