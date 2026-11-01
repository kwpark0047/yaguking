import { useState } from 'react';
import { Link } from 'react-router';
import { kstDate } from '@/lib/game/attendance';
import { DAILY_TOTAL, loadDaily, resultEmoji, streakAlive, todayRecord } from '@/lib/game/daily';

/** 홈의 "오늘의 1이닝" 단추(docs/retention-plan.md A) — 기기 기록만 본다(읽기 0). 끝냈으면 오늘 결과·연속 */
export function DailyLink({ style }: { style: React.CSSProperties }) {
  const today = kstDate();
  const [record] = useState(() => todayRecord(loadDaily(), today));
  const done = record.results.length >= DAILY_TOTAL;
  const streak = streakAlive(record, today) ? record.streak : 0;
  return (
    <Link to="/daily" className="flex min-h-14 flex-col items-center justify-center rounded-option border-2 px-3 py-1 font-semibold" style={style}>
      <span>
        오늘의 1이닝 {done ? <span aria-label={`결과 ${record.results.length}타석`}>{record.results.map(resultEmoji).join('')}</span> : '(3문제)'}
      </span>
      <span className="text-xs font-normal text-ink-2">
        {done ? `오늘 끝! 내일 새 문제${streak > 1 ? ` · 연속 ${streak}일` : ''}` : streak > 0 ? `연속 ${streak}일째 — 오늘도 이어 가요` : '모두 같은 문제, 결과를 친구와 비교해요'}
      </span>
    </Link>
  );
}
