import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUOTA_MESSAGE, dataErrorMessage, isQuotaExceeded } from '@/lib/firebase/errors';
import { countReads, countWrites, queryReads, usageSnapshot } from '@/lib/firebase/meter';
import { MASTERED_PARK_DAYS, REVIEW_DAYS } from '@/lib/game/review';
import { NOTES_PAGE_SIZE } from '@/lib/game/persist';

const src = join(__dirname, '../../src');

function hangulInSource(dir: string, found = new Set<string>()): Set<string> {
  for (const name of readdirSync(dir)) {
    const child = join(dir, name);
    if (statSync(child).isDirectory()) hangulInSource(child, found);
    else if (/\.(ts|tsx)$/.test(name)) for (const char of readFileSync(child, 'utf8')) if (/[가-힣]/.test(char)) found.add(char);
  }
  return found;
}

describe('제목 글꼴 줄인 판', () => {
  it('화면 문구의 한글이 모두 들어 있다 — 빠졌으면 npm run font:subset', () => {
    const kept = new Set(readFileSync(join(src, 'assets/fonts/jua-subset.txt'), 'utf8').trim());
    const missing = [...hangulInSource(src)].filter((char) => !kept.has(char));
    expect(missing.join('')).toBe('');
  });

  it('원본 대신 줄인 판을 쓴다(원본 한글 파일 360 KB)', () => {
    const size = statSync(join(src, 'assets/fonts/jua-subset.woff2')).size;
    expect(size).toBeLessThan(160 * 1024);
    const main = readFileSync(join(src, 'main.tsx'), 'utf8');
    expect(main).not.toMatch(/@fontsource\/jua/);
  });
});

describe('무료 한도를 넘었을 때', () => {
  it('하루 한도 초과는 따로 알린다(다시 열리는 시각 포함)', () => {
    expect(isQuotaExceeded({ code: 'resource-exhausted' })).toBe(true);
    expect(dataErrorMessage({ code: 'resource-exhausted' }, '실패')).toBe(QUOTA_MESSAGE);
    expect(QUOTA_MESSAGE).toMatch(/오후 4~5시/);
  });

  it('연결 끊김과 그 밖의 오류', () => {
    expect(dataErrorMessage({ code: 'unavailable' }, '실패')).toMatch(/연결/);
    expect(dataErrorMessage({ code: 'permission-denied' }, '실패')).toBe('실패');
    expect(dataErrorMessage(null, '실패')).toBe('실패');
  });
});

describe('사용량 계량', () => {
  it('쿼리는 결과가 없어도 1읽기', () => {
    expect(queryReads(0)).toBe(1);
    expect(queryReads(30)).toBe(30);
  });

  it('행동별로 더한다', () => {
    const before = usageSnapshot();
    countReads('test:a', 2);
    countWrites('test:a', 3);
    countReads('test:b', 1);
    const after = usageSnapshot();
    expect([after.reads - before.reads, after.writes - before.writes]).toEqual([3, 3]);
    expect(after.byLabel['test:a']).toEqual({ reads: 2, writes: 3 });
  });

  it('오답노트는 30개씩, 익힌 문항은 목록 끝으로', () => {
    expect(NOTES_PAGE_SIZE).toBe(30);
    expect(MASTERED_PARK_DAYS).toBeGreaterThan(REVIEW_DAYS[REVIEW_DAYS.length - 1]! * 10);
  });
});
