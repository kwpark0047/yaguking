import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as adminJob from '../../../ops/admin.mjs';
import {
  ACQUISITION_KEY,
  ACQUISITION_SOURCES,
  ACQUISITION_START,
  acquisitionStarted,
  parseAcquisition,
  withShareTag,
  withoutUtm,
} from '@/lib/growth/acquisition';
import { ACQUISITION_PRIVACY_EFFECTIVE, KBO_PRIVACY_EFFECTIVE, PRIVACY_VERSIONS, upcomingVersion } from '@/content/privacy';

const rules = readFileSync(join(__dirname, '../../../firestore.rules'), 'utf8');
const kst = (date: string) => Date.parse(`${date}T00:00:00+09:00`);

describe('유입 출처 — 앱·운영자 PC·규칙·처리방침이 같은 값', () => {
  it('시행일·출처 목록이 ops/admin.mjs와 같다', () => {
    expect(adminJob.ACQUISITION_START).toBe(ACQUISITION_START);
    expect(adminJob.ACQUISITION_SOURCES).toEqual([...ACQUISITION_SOURCES]);
  });

  it('규칙의 출처 목록이 같다', () => {
    const list = `[${ACQUISITION_SOURCES.map((source) => `'${source}'`).join(', ')}]`;
    expect(rules).toContain(`request.resource.data.source in ${list}`);
    expect(rules).toContain("campaign.matches('^[a-z0-9_-]{0,40}$')");
  });

  it('처리방침 개정판 시행일 = 기록을 시작하는 날, KBO 퀴즈 판 다음 판, 7일 전 공지가 가능한 날', () => {
    expect(ACQUISITION_PRIVACY_EFFECTIVE).toBe(ACQUISITION_START);
    expect(upcomingVersion(KBO_PRIVACY_EFFECTIVE)?.effective).toBe(ACQUISITION_START);
    const latest = PRIVACY_VERSIONS.find((version) => version.effective === ACQUISITION_START)!;
    expect(latest.effective).toBe(ACQUISITION_START);
    const text = JSON.stringify(latest.sections);
    expect(text).toContain(ACQUISITION_KEY);
    expect(text).toContain('홍보 효과 측정');
    expect(text).toContain(`시행일: ${ACQUISITION_START}`);
    expect(latest.changes.join(' ')).toContain('이전에 본 페이지 주소');
  });

  it('처리방침 개정은 이전 판의 위탁·국외 이전·제3자 제공·권리·아동·보안을 바꾸지 않는다', () => {
    const index = PRIVACY_VERSIONS.findIndex((version) => version.effective === ACQUISITION_START);
    const before = PRIVACY_VERSIONS[index - 1]!;
    const latest = PRIVACY_VERSIONS[index]!;
    const of = (version: typeof latest, id: string) => JSON.stringify(version.sections.find((section) => section.id === id));
    for (const id of ['outsourcing', 'overseas', 'third-party', 'rights', 'children', 'security', 'public']) expect(of(latest, id)).toBe(of(before, id));
  });

  it('시행일 0시(한국 시간)부터', () => {
    expect(acquisitionStarted(kst(ACQUISITION_START) - 1)).toBe(false);
    expect(acquisitionStarted(kst(ACQUISITION_START))).toBe(true);
  });
});

describe('홍보 링크 읽기', () => {
  it('출처는 목록만, 그 밖은 etc. 대소문자·공백은 정리', () => {
    expect(parseAcquisition('?utm_source=Instagram&utm_campaign=launch_1125')).toEqual({ source: 'instagram', campaign: 'launch_1125' });
    expect(parseAcquisition('?utm_source=naver&utm_campaign=blog')).toEqual({ source: 'etc', campaign: 'blog' });
    expect(parseAcquisition('?utm_source=%20threads%20')).toEqual({ source: 'threads', campaign: '' });
  });

  it('출처 표시가 없으면 아무것도 남기지 않는다', () => {
    expect(parseAcquisition('')).toBeNull();
    expect(parseAcquisition('?utm_campaign=launch')).toBeNull();
    expect(parseAcquisition('?ref=abc')).toBeNull();
  });

  it('캠페인은 영소문자·숫자·-·_ 40자까지, 아니면 비운다(아무 글이나 저장되지 않게)', () => {
    expect(parseAcquisition('?utm_source=x&utm_campaign=한글')?.campaign).toBe('');
    expect(parseAcquisition('?utm_source=x&utm_campaign=a%20b')?.campaign).toBe('');
    expect(parseAcquisition('?utm_source=x&utm_campaign=https://evil')?.campaign).toBe('');
    expect(parseAcquisition(`?utm_source=x&utm_campaign=${'a'.repeat(60)}`)?.campaign).toBe('a'.repeat(40));
  });

  it('주소창에서 utm_ 칸만 지운다', () => {
    expect(withoutUtm('https://yaguking.web.app/daily?utm_source=x&utm_campaign=y&room=1#top')).toBe('https://yaguking.web.app/daily?room=1#top');
    expect(withoutUtm('https://yaguking.web.app/?utm_source=x')).toBe('https://yaguking.web.app/');
  });
});

describe('앱 안 공유 링크 표시', () => {
  const after = kst(ACQUISITION_START);
  it('시행일부터 웹 주소에만 share 표시를 붙인다', () => {
    expect(withShareTag('https://yaguking.web.app/daily', 'daily', after)).toBe('https://yaguking.web.app/daily?utm_source=share&utm_campaign=daily');
    expect(withShareTag('https://yaguking.web.app/room/ABC234', 'room', after)).toBe('https://yaguking.web.app/room/ABC234?utm_source=share&utm_campaign=room');
    expect(withShareTag('intoss://yaguking/room/ABC234', 'room', after)).toBe('intoss://yaguking/room/ABC234');
    expect(withShareTag('https://yaguking.web.app/daily', 'daily', after - 1)).toBe('https://yaguking.web.app/daily');
  });
});
