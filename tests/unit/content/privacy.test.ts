import { describe, expect, it } from 'vitest';
import {
  PRIVACY_DRAFT,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
} from '@/content/privacy';
import {
  AUTH_LOG_RETENTION_DAYS,
  GUEST_COOKIE_DAYS,
  GUEST_RETENTION_DAYS,
  STYLE_COOKIE_DAYS,
} from '@/lib/privacy/retention';
import { GUEST_COOKIE_MAX_AGE } from '@/lib/guest/token';
import { STYLE_COOKIE_MAX_AGE } from '@/lib/theme/style';

/**
 * 개인정보처리방침 본문 (src/content/privacy.ts, 15 문서).
 *
 * 시행 중인 방침에 빈칸이 남거나, 적힌 숫자가 실제 동작과 다르면 방침이 거짓이 된다.
 */

const allText = [
  PRIVACY_INTRO,
  ...PRIVACY_SECTIONS.flatMap((section) => [
    section.title,
    section.lead ?? '',
    ...(section.paragraphs ?? []),
    ...(section.items ?? []),
    ...(section.table ? [...section.table.head, ...section.table.rows.flat()] : []),
  ]),
].join('\n');

describe('개인정보처리방침', () => {
  it('시행 중이면 빈칸(〔 〕)이 하나도 없고 시행일이 실제 날짜다', () => {
    if (PRIVACY_DRAFT) return;
    expect(allText).not.toMatch(/〔|〕/);
    expect(PRIVACY_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const date = new Date(`${PRIVACY_EFFECTIVE_DATE}T00:00:00Z`);
    expect(date.toISOString().slice(0, 10)).toBe(PRIVACY_EFFECTIVE_DATE);
  });

  it('보관 기간 숫자가 실제 파기 기준(retention.ts)과 같다', () => {
    expect(allText).toContain(`마지막 이용 후 ${GUEST_RETENTION_DAYS}일`);
    expect(allText).toContain(`${AUTH_LOG_RETENTION_DAYS}일`);
  });

  it('쿠키 보관 기간이 실제 쿠키 수명과 같다', () => {
    expect(GUEST_COOKIE_DAYS * 24 * 60 * 60).toBe(GUEST_COOKIE_MAX_AGE);
    expect(STYLE_COOKIE_DAYS * 24 * 60 * 60).toBe(STYLE_COOKIE_MAX_AGE);
  });

  it('법이 요구하는 항목이 모두 있다', () => {
    const titles = PRIVACY_SECTIONS.map((section) => section.title).join(' ');
    for (const required of [
      '처리 목적',
      '항목',
      '보유 기간',
      '제3자 제공',
      '처리 위탁',
      '국외 이전',
      '권리',
      '14세',
      '안전성',
      '보호책임자',
      '권익 침해',
      '변경',
    ]) {
      expect(titles).toContain(required);
    }
  });

  it('국외 이전을 고지하면 법정 항목 일곱 가지를 모두 적는다', () => {
    const overseas = PRIVACY_SECTIONS.find((section) => section.id === 'overseas');
    const labels = overseas?.table?.rows.map((row) => row[0]) ?? [];
    if (labels.length === 0) return; // 국외 이전이 없으면 표가 없다
    for (const label of [
      '이전받는 자',
      '이전 국가',
      '이전 시기와 방법',
      '이전 항목',
      '이전 목적',
      '보유·이용 기간',
      '거부 방법과 그 결과',
    ]) {
      expect(labels).toContain(label);
    }
  });
});
