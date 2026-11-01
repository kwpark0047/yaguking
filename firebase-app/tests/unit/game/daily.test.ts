import { beforeEach, describe, expect, it } from 'vitest';
import questions from '@/content/questions.generated.json';
import type { Question } from '@/content/questions';
import { DAILY_STORAGE_KEY, dailySummary, loadDaily, pickDaily, previousDate, recordAtBat, shareText, streakAlive, todayRecord } from '@/lib/game/daily';
import { buildIcs, fold, googleCalendarUrl, REMINDERS } from '@/lib/reminder/calendar';

const bank = questions as Question[];

/** 기기 저장소 흉내(node에는 localStorage가 없다) */
beforeEach(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

describe('오늘의 1이닝(docs/retention-plan.md A)', () => {
  it('같은 날은 어느 기기에서나 같은 3문제 — 쉬움·보통·어려움 하나씩, 규칙은 많아야 하나, 날이 바뀌면 다른 문제', () => {
    const today = pickDaily(bank, '2026-11-02');
    expect(today).toHaveLength(3);
    expect(today.map((q) => q.difficulty)).toEqual(['easy', 'normal', 'hard']);
    expect(pickDaily([...bank].reverse(), '2026-11-02').map((q) => q.id)).toEqual(today.map((q) => q.id));
    expect(pickDaily(bank, '2026-11-03').map((q) => q.id)).not.toEqual(today.map((q) => q.id));
    for (let day = 1; day <= 60; day += 1) {
      const date = new Date(Date.UTC(2026, 10, day)).toISOString().slice(0, 10);
      expect(pickDaily(bank, date).filter((q) => q.category === 'rules').length, date).toBeLessThanOrEqual(1);
    }
  });

  it('공유 줄: 안타 이상 🟩·볼넷 🟨·아웃 🟥, 연속은 2일부터', () => {
    expect(dailySummary(['HR', 'K', 'BB'])).toBe('1안타 1볼넷 1아웃');
    expect(shareText('2026-11-02', ['1B', 'K', '2B'], 4, 'https://yaguking.web.app/daily')).toBe(
      '⚾ 야구왕 오늘의 1이닝 11/2\n🟩🟥🟩 2안타 1아웃\n연속 4일\nhttps://yaguking.web.app/daily',
    );
    expect(shareText('2026-11-02', ['K', 'K', 'K'], 1, 'u')).toBe('⚾ 야구왕 오늘의 1이닝 11/2\n🟥🟥🟥 3아웃\nu');
  });

  it('기기 기록: 타석마다 남기고 3번째에 연속을 센다 — 어제 끝냈으면 +1, 하루 건너뛰면 1부터, 다른 날 진행은 버린다', () => {
    let record = todayRecord(loadDaily(), '2026-11-02');
    record = recordAtBat(record, '2026-11-02', 'HR');
    expect(loadDaily().results).toEqual(['HR']); // 중간에 닫아도 남는다
    record = recordAtBat(record, '2026-11-02', 'K');
    record = recordAtBat(record, '2026-11-02', '1B');
    expect(record).toMatchObject({ lastDone: '2026-11-02', streak: 1, best: 1 });
    expect(recordAtBat(record, '2026-11-02', 'HR').results).toHaveLength(3); // 하루 한 번

    record = recordAtBat(recordAtBat(recordAtBat(record, '2026-11-03', 'K'), '2026-11-03', 'K'), '2026-11-03', 'K');
    expect(record).toMatchObject({ streak: 2, best: 2 });
    expect(streakAlive(record, '2026-11-04')).toBe(true);
    expect(streakAlive(record, '2026-11-05')).toBe(false);
    record = recordAtBat(recordAtBat(recordAtBat(record, '2026-11-05', 'BB'), '2026-11-05', 'BB'), '2026-11-05', 'BB');
    expect(record).toMatchObject({ streak: 1, best: 2 });
    expect(todayRecord(record, '2026-11-06').results).toEqual([]);
    expect(previousDate('2026-11-01')).toBe('2026-10-31');
  });

  it('저장소가 깨졌거나 없으면 처음부터', () => {
    localStorage.setItem(DAILY_STORAGE_KEY, '{oops');
    expect(loadDaily()).toMatchObject({ results: [], streak: 0 });
  });
});

describe('달력 알림(docs/retention-plan.md B)', () => {
  it('아침 11시·저녁 8시 매일 반복 일정, 11-05부터(한국 시각 → UTC), 알림 포함', () => {
    const ics = buildIcs(REMINDERS, 'https://yaguking.web.app/daily', Date.parse('2026-11-02T00:00:00Z'));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20261105T020000Z'); // 11시 KST
    expect(ics).toContain('DTSTART:20261105T110000Z'); // 20시 KST
    expect(ics.match(/RRULE:FREQ=DAILY/g)).toHaveLength(2);
    expect(ics).toContain('SUMMARY:매일 아침 11시 야구왕');
    expect(ics).toContain('TRIGGER:PT0M');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it('긴 줄은 글자를 깨지 않고 75바이트로 접는다', () => {
    const folded = fold(`DESCRIPTION:${'야구왕'.repeat(20)}`);
    expect(folded.split('\r\n ').join('')).toBe(`DESCRIPTION:${'야구왕'.repeat(20)}`);
  });

  it('구글 캘린더 주소: 일정 하나, 매일 반복, 10분', () => {
    const url = new URL(googleCalendarUrl(REMINDERS[1]!, 'https://yaguking.web.app/daily'));
    expect(url.origin).toBe('https://calendar.google.com');
    expect(url.searchParams.get('text')).toBe('매일 저녁 8시 야구왕');
    expect(url.searchParams.get('dates')).toBe('20261105T110000Z/20261105T111000Z');
    expect(url.searchParams.get('recur')).toBe('RRULE:FREQ=DAILY');
  });
});
