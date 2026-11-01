import { ENGAGEMENT_START } from '@/lib/game/attendance';

/**
 * 달력 알림(docs/retention-plan.md B) — "매일 아침 11시 야구왕"·"매일 저녁 8시 야구왕" 반복 일정을 **기기에서** 만든다.
 * 서버로 아무것도 보내지 않고(토큰·연락처 없음), 사람의 달력이 알림을 띄운다. 11-05(출석·공식전 시작)부터 매일(운영자 결정 11-02).
 * 한국은 서머타임이 없어 UTC 시각으로 적는다(아침 11시 = 02:00Z, 저녁 8시 = 11:00Z).
 */
export const REMINDER_START = ENGAGEMENT_START;

export interface Reminder {
  id: 'morning' | 'evening';
  hour: number;
  title: string;
}

export const REMINDERS: readonly Reminder[] = [
  { id: 'morning', hour: 11, title: '매일 아침 11시 야구왕' },
  { id: 'evening', hour: 20, title: '매일 저녁 8시 야구왕' },
];

const DESCRIPTION = '오늘의 1이닝(3문제)·오늘의 공식전 하러 가기';

/** 한국 시각 그날 hour시 → iCalendar UTC 시각(YYYYMMDDTHHMMSSZ) */
function utcStamp(date: string, hour: number, minutes = 0): string {
  const ms = Date.parse(`${date}T00:00:00+09:00`) + (hour * 60 + minutes) * 60_000;
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** iCalendar 글자 이스케이프 */
const text = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** 한 줄 75바이트 넘으면 접는다(RFC 5545 §3.1 — 한글은 3바이트라 글자 경계에서 자른다) */
export function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74; // 이어지는 줄은 앞의 빈칸 1바이트
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** 고른 알림들을 한 .ics 파일로 */
export function buildIcs(chosen: readonly Reminder[], appUrl: string, now = Date.now()): string {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//YaguKing//Daily Reminder//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const reminder of chosen) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:yaguking-${reminder.id}@yaguking.web.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(REMINDER_START, reminder.hour)}`,
      'DURATION:PT10M',
      'RRULE:FREQ=DAILY',
      `SUMMARY:${text(reminder.title)}`,
      `DESCRIPTION:${text(`${DESCRIPTION} ${appUrl}`)}`,
      `URL:${appUrl}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${text(reminder.title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

/** 구글 캘린더 "일정 만들기" 주소(한 번에 일정 하나) — 안드로이드에서 .ics가 바로 열리지 않을 때 */
export function googleCalendarUrl(reminder: Reminder, appUrl: string): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: reminder.title,
    dates: `${utcStamp(REMINDER_START, reminder.hour)}/${utcStamp(REMINDER_START, reminder.hour, 10)}`,
    recur: 'RRULE:FREQ=DAILY',
    details: `${DESCRIPTION} ${appUrl}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
