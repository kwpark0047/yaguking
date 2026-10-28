import { daysInMonth } from '@/lib/game/attendance';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 이번 달 출석 달력 — 찍은 날은 도장(색 + "출석" 글자), 오늘은 굵은 테두리. 움직임 없음.
 * 화면 읽기에는 칸마다 "5일 출석" / "5일"로 읽힌다.
 */
export function AttendanceCalendar({ month, days, today }: { month: string; days: readonly number[]; today: number | null }) {
  const stamped = new Set(days);
  const total = daysInMonth(month);
  const offset = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4, 6)) - 1, 1)).getUTCDay();
  return (
    <div className="w-full">
      <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-center text-xs text-ink-2">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <ol aria-label="이번 달 출석" className="mt-1 grid grid-cols-7 gap-1 text-center text-xs">
        {Array.from({ length: total }, (_, index) => {
          const day = index + 1;
          const on = stamped.has(day);
          return (
            <li
              key={day}
              aria-label={on ? `${day}일 출석` : `${day}일`}
              aria-current={day === today ? 'date' : undefined}
              className="flex aspect-square items-center justify-center rounded-full"
              style={{
                ...(index === 0 ? { gridColumnStart: offset + 1 } : {}),
                backgroundColor: on ? 'var(--accent)' : 'transparent',
                color: on ? 'var(--accent-ink)' : 'var(--ink-2)',
                border: day === today ? '2px solid var(--ink-1)' : '1px solid var(--line)',
                fontWeight: on ? 700 : 400,
              }}
            >
              {day}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
