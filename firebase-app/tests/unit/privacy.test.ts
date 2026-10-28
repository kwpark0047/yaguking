import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as cleanupJob from '../../ops/cleanup.mjs';
import {
  ADMIN_LOG_RETENTION_YEARS,
  ADMIN_PRIVACY_EFFECTIVE,
  DEVICE_STORAGE_KEYS,
  PRIVACY_VERSIONS,
  kstDateKey,
  upcomingVersion,
  upcomingVersions,
  ENGAGEMENT_PRIVACY_EFFECTIVE,
  versionInForce,
  PRIVACY_DRAFT,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_OFFICER,
  PRIVACY_OPERATOR,
  PRIVACY_SECTIONS,
} from '@/content/privacy';
import * as monthlyJob from '../../ops/monthly.mjs';
import { ENGAGEMENT_START, HIDDEN_NAME, RANKING_TOP } from '@/lib/game/attendance';
import { GUEST_RETENTION_DAYS, LEADERBOARD_MONTHS_KEPT, ROOM_RETENTION_HOURS, SEEN_QUESTIONS_KEPT } from '@/lib/privacy/retention';

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

describe('처리방침 개정(2026-11-03, 관리자 열람)', () => {
  it('오늘 날짜로 시행 중인 판과 예고된 판을 고른다', () => {
    expect(versionInForce('2026-10-27').effective).toBe('2026-10-27');
    expect(versionInForce('2026-11-02').effective).toBe('2026-10-27');
    expect(versionInForce('2026-11-03').effective).toBe(ADMIN_PRIVACY_EFFECTIVE);
    expect(upcomingVersion('2026-10-27')?.effective).toBe(ADMIN_PRIVACY_EFFECTIVE);
    expect(upcomingVersion('2026-11-03')?.effective).toBe(ENGAGEMENT_PRIVACY_EFFECTIVE);
    expect(upcomingVersions('2026-10-29').map((version) => version.effective)).toEqual([ADMIN_PRIVACY_EFFECTIVE, ENGAGEMENT_PRIVACY_EFFECTIVE]);
    expect(upcomingVersion(ENGAGEMENT_PRIVACY_EFFECTIVE)).toBeNull();
    expect(kstDateKey(Date.UTC(2026, 10, 2, 15))).toBe('2026-11-03'); // 한국 시간 11월 3일 0시
  });

  it('개정판: 운영 관리 목적·접속기록 2년·관리 화면 보호를 더하고, 위탁·국외 이전·수집 항목 외 나머지는 그대로', () => {
    const next = PRIVACY_VERSIONS.find((version) => version.effective === ADMIN_PRIVACY_EFFECTIVE)!;
    const text = JSON.stringify(next.sections);
    expect(text).toContain('서비스 운영 관리');
    expect(text).toContain(`${ADMIN_LOG_RETENTION_YEARS}년`);
    expect(text).toContain(`시행일: ${ADMIN_PRIVACY_EFFECTIVE}`);
    const same = (id: string) => JSON.stringify(next.sections.find((s) => s.id === id));
    const before = (id: string) => JSON.stringify(PRIVACY_SECTIONS.find((s) => s.id === id));
    for (const id of ['outsourcing', 'overseas', 'third-party', 'device', 'rights', 'children']) expect(same(id)).toBe(before(id));
    expect(next.changes.length).toBeGreaterThan(0);
  });

  it('관리자 기록 보관 기간이 정리 작업(ops/cleanup.mjs)과 같다', () => {
    expect(cleanupJob.ADMIN_LOG_RETENTION_DAYS).toBe(ADMIN_LOG_RETENTION_YEARS * 365);
  });
  // 회원 정보 열람은 2026-10-28부터(운영자 결정) — 그전에 두었던 시행일 잠금(11-03)은 뺐다. docs/admin-dashboard-plan.md
});

describe('처리방침 개정(출석·월간 등수, docs/engagement-plan.md)', () => {
  const next = PRIVACY_VERSIONS.find((version) => version.effective === ENGAGEMENT_PRIVACY_EFFECTIVE)!;
  const text = JSON.stringify(next.sections);

  it('출석·등수 화면을 여는 날 = 시행일, 11-03 판 위에 더한다(관리자 열람 내용 유지)', () => {
    expect(ENGAGEMENT_PRIVACY_EFFECTIVE).toBe(ENGAGEMENT_START);
    expect(ENGAGEMENT_PRIVACY_EFFECTIVE > ADMIN_PRIVACY_EFFECTIVE).toBe(true);
    expect(text).toContain('서비스 운영 관리');
    expect(text).toContain(`시행일: ${ENGAGEMENT_PRIVACY_EFFECTIVE}`);
    const admin = PRIVACY_VERSIONS.find((version) => version.effective === ADMIN_PRIVACY_EFFECTIVE)!;
    const same = (id: string) => JSON.stringify(next.sections.find((s) => s.id === id));
    const before = (id: string) => JSON.stringify(admin.sections.find((s) => s.id === id));
    for (const id of ['outsourcing', 'overseas', 'third-party', 'device', 'rights', 'children', 'security']) expect(same(id)).toBe(before(id));
  });

  it('공개 범위·보관 기간이 등수 작업(ops/monthly.mjs)과 같다', () => {
    expect(monthlyJob.LEADERBOARD_MONTHS_KEPT).toBe(LEADERBOARD_MONTHS_KEPT);
    expect(text).toContain(`${LEADERBOARD_MONTHS_KEPT}개월`);
    expect(text).toContain(`상위 ${RANKING_TOP}명`);
    expect(text).toContain(HIDDEN_NAME);
    expect(text).toContain(monthlyJob.REMOVED_NAME);
    expect(text).toContain('출석한 날짜');
  });
});
