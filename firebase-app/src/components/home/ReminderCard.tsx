import { useState } from 'react';
import { buildIcs, googleCalendarUrl, REMINDER_START, REMINDERS, type Reminder } from '@/lib/reminder/calendar';

/**
 * "매일 알림 받기"(docs/retention-plan.md B) — 고른 시각의 반복 일정을 내 달력에 넣는다.
 * 파일은 이 기기에서 만들고 서버로 보내는 것은 없다. 구글 캘린더 단추는 구글의 일정 만들기 화면으로 간다.
 */
export function ReminderCard() {
  const [chosen, setChosen] = useState<Reminder['id'][]>(['morning', 'evening']);
  const [saved, setSaved] = useState(false);
  const picked = REMINDERS.filter((reminder) => chosen.includes(reminder.id));
  const appUrl = `${location.origin}/daily`;

  function download() {
    const blob = new Blob([buildIcs(picked, appUrl)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'yaguking-alarm.ics';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    setSaved(true);
  }

  return (
    <section aria-labelledby="reminder-title" className="sticker flex flex-col gap-3 p-4 text-sm break-keep">
      <h2 id="reminder-title" className="font-cute text-xl">
        매일 알림 받기
      </h2>
      <p>
        내 달력에 반복 일정을 넣으면 달력이 시간 맞춰 알려 줘요. {Number(REMINDER_START.slice(5, 7))}월 {Number(REMINDER_START.slice(8, 10))}일부터
        매일이에요. 앱은 아무것도 모으지 않아요.
      </p>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
        <legend className="sr-only">알림 시각</legend>
        {REMINDERS.map((reminder) => (
          <label key={reminder.id} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={chosen.includes(reminder.id)}
              onChange={(event) =>
                setChosen((list) => (event.target.checked ? [...list, reminder.id] : list.filter((id) => id !== reminder.id)))
              }
              className="h-5 w-5"
            />
            {reminder.title}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={picked.length === 0}
          onClick={download}
          className="min-h-11 rounded-option px-4 font-semibold disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          달력에 넣기(아이폰·PC)
        </button>
        {picked.map((reminder) => (
          <a
            key={reminder.id}
            href={googleCalendarUrl(reminder, appUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-11 items-center justify-center rounded-option border-2 px-4 font-semibold"
            style={{ borderColor: 'var(--line)' }}
          >
            구글 캘린더에 넣기 — {reminder.hour === 11 ? '아침 11시' : '저녁 8시'}
          </a>
        ))}
      </div>
      {saved && (
        <p role="status">
          알림 파일(yaguking-alarm.ics)을 받았어요. 열어서 "추가"를 누르면 달력에 들어가요. 그만 받으려면 달력에서 일정을 지우면 돼요.
        </p>
      )}
    </section>
  );
}
