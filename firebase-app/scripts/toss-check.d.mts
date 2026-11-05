/** toss-check.mjs의 형(테스트가 TypeScript에서 불러온다) */
export const FORBIDDEN_IN_TOSS: readonly (readonly [string, RegExp])[];
export function checkTossDist(files: readonly { path: string; text: string | null }[]): string[];
