import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as cleanupJob from '../../ops/cleanup.mjs';
import {
  DEVICE_STORAGE_KEYS,
  PRIVACY_DRAFT,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_OFFICER,
  PRIVACY_OPERATOR,
  PRIVACY_SECTIONS,
} from '@/content/privacy';
import { GUEST_RETENTION_DAYS, ROOM_RETENTION_HOURS, SEEN_QUESTIONS_KEPT } from '@/lib/privacy/retention';

/** 9단계 — 처리방침 Firebase판 초안이 코드의 사실과 맞는지 */
const src = join(__dirname, '../../src');
const allText = PRIVACY_SECTIONS.map((section) => JSON.stringify(section)).join('\n');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const child = join(dir, name);
    if (statSync(child).isDirectory()) sourceFiles(child, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(child);
  }
  return out;
}

describe('처리방침 숫자 = 실제로 지우는 기간', () => {
  it('비회원 30일·대결 방 24시간이 정리 작업(ops/cleanup.mjs)과 같다', () => {
    expect(cleanupJob.GUEST_RETENTION_DAYS).toBe(GUEST_RETENTION_DAYS);
    expect(cleanupJob.ROOM_RETENTION_HOURS).toBe(ROOM_RETENTION_HOURS);
    expect(allText).toContain(`마지막 이용 후 ${GUEST_RETENTION_DAYS}일`);
    expect(allText).toContain(`방을 만든 뒤 ${ROOM_RETENTION_HOURS}시간`);
  });

  it('최근 본 문항 수가 코드(persist.ts)와 같다', () => {
    const persist = readFileSync(join(src, 'lib/game/persist.ts'), 'utf8');
    expect(persist).toContain(`const SEEN_MAX = ${SEEN_QUESTIONS_KEPT};`);
  });
});

describe('처리방침 항목 = 코드가 실제로 하는 일', () => {
  // lib/theme/style.ts(화면 스타일 쿠키 yk_style)는 0단계에 복사해 왔지만 쓰는 화면이 없다 → 쿠키를 쓰지 않는다.
  // 누가 화면에 붙이면 아래 테스트가 실패한다 — 그때 처리방침 §10에 쿠키를 적는다.
  const STYLE_MODULE = join(src, 'lib/theme/style.ts');

  it('쿠키를 쓰지 않는다(화면 스타일 쿠키 모듈은 어느 화면도 쓰지 않음)', () => {
    for (const file of sourceFiles(src)) {
      if (file === STYLE_MODULE) continue;
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/document\.cookie|@\/lib\/theme\/style'/);
    }
  });

  it('기기 저장소 키를 빠짐없이 적었다(코드에서 찾은 키와 같다)', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(src)) {
      if (file === STYLE_MODULE || file.endsWith('privacy.ts')) continue;
      for (const match of readFileSync(file, 'utf8').matchAll(/'(yk_[a-z_]+)'/g)) used.add(match[1]!);
    }
    expect([...used].sort()).toEqual([...DEVICE_STORAGE_KEYS].sort());
    for (const key of DEVICE_STORAGE_KEYS) expect(allText).toContain(key);
  });

  it('쓰지 않는 서비스·기능을 적지 않았다(기존 앱 문안의 흔적)', () => {
    expect(allText).not.toMatch(/Supabase|Vercel|카카오|yk_guest|yk_style|sb-|내보내기|랭킹|공유 링크/);
  });

  it('운영 주체·보호책임자가 있고, 확정본이면 시행일이 날짜다(초안이면 없다)', () => {
    expect(PRIVACY_OPERATOR).toBeTruthy();
    expect(PRIVACY_OFFICER.name && PRIVACY_OFFICER.phone).toBeTruthy();
    if (PRIVACY_DRAFT) expect(PRIVACY_EFFECTIVE_DATE).toBeNull();
    else expect(PRIVACY_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(allText).toContain(`시행일: ${PRIVACY_EFFECTIVE_DATE ?? '확정 전(공개일에 정함)'}`);
  });

  it('정리 작업은 운영자가 직접 — GitHub 위탁은 GitHub 정리 워크플로를 켤 때만 적는다', () => {
    const workflow = readFileSync(join(__dirname, '../../../.github/workflows/firebase-cleanup.yml'), 'utf8');
    const githubCleanupOn = /^ {2}schedule:/m.test(workflow);
    expect(allText.includes('GitHub')).toBe(githubCleanupOn);
    expect(allText).toContain('정리 작업은 운영자가 직접 실행합니다');
    expect(new Set(PRIVACY_SECTIONS.map((section) => section.id)).size).toBe(PRIVACY_SECTIONS.length);
  });
});
