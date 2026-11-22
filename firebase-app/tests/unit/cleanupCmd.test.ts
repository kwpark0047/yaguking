import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 0시 작업(ops/run-cleanup.cmd) — 모든 node 줄이 운영 CLI와 같은 로그 파일을 쓴다.
 * 경로의 \가 빠지면(예: opsadmin-cli.mjs) 그 단계만 조용히 실패하므로 여기서 막는다.
 */
const lines = readFileSync(resolve(__dirname, '../../ops/run-cleanup.cmd'), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.startsWith('node '));

describe('0시 작업 명령 줄', () => {
  it('node 줄이 있다', () => {
    expect(lines.length).toBeGreaterThan(5);
  });

  it.each(lines)('%s', (line) => {
    expect(line).toMatch(/^node ops\\[a-z-]+\.mjs /);
    expect(line).toMatch(/ >> ops\\logs\\cleanup\.log 2>&1$/);
  });

  it('초대 단계는 지갑보다 먼저', () => {
    const at = (command: string) => lines.findIndex((line) => line.startsWith(`node ops\\admin-cli.mjs ${command} `));
    expect(at('invites')).toBeGreaterThanOrEqual(0);
    expect(at('invites')).toBeLessThan(at('wallet'));
  });
});
