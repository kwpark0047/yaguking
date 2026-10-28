import { useCallback, useEffect, useState } from 'react';
import { loadEvents, saveDoubleDays, type EventsConfig } from '../data';
import { ErrorText, PageTitle, StatCard, field, fmtTime, line, primary } from '../ui';

const MAX_DOUBLE_DAYS = 31;
const todayKst = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);

/**
 * 이벤트(docs/engagement-plan.md §6) — 출석 2배 날과 오늘의 공식전 문항 현황. 열 때 문서 하나(읽기 1).
 * 2배 날은 다음 새벽 등수 작업(ops/monthly.mjs)부터 등수·이용자 앱에 반영된다. 지난 날은 고를 수 없다(이미 센 포인트가 바뀜).
 */
export function EventsPage() {
  const [config, setConfig] = useState<EventsConfig | null>(null);
  const [days, setDays] = useState<string[]>([]);
  const [pick, setPick] = useState(todayKst());
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    loadEvents()
      .then((value) => {
        setConfig(value);
        setDays([...value.doubleDays].sort());
      })
      .catch(() => setError('이벤트 설정을 불러오지 못했어요.'));
  }, []);
  useEffect(refresh, [refresh]);

  function add() {
    setStatus(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pick)) return setError('날짜를 골라 주세요.');
    if (pick < todayKst()) return setError('지난 날은 고를 수 없어요(이미 센 포인트가 바뀌어요).');
    if (days.includes(pick)) return setError('이미 있는 날이에요.');
    if (days.length >= MAX_DOUBLE_DAYS) return setError(`최대 ${MAX_DOUBLE_DAYS}일까지예요.`);
    setError(null);
    setDays([...days, pick].sort());
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      // 지난 날은 기록으로만 남아 있으면 되므로 저장할 때 뺀다(목록이 계속 늘지 않게)
      const keep = days.filter((day) => day >= todayKst().slice(0, 8) + '01');
      await saveDoubleDays(keep);
      setStatus('저장했어요. 다음 새벽 등수 작업부터 이용자 앱에 반영돼요.');
      refresh();
    } catch {
      setError('저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  const official = config?.official ?? null;
  const changed = config !== null && JSON.stringify([...config.doubleDays].sort()) !== JSON.stringify(days);

  return (
    <>
      <PageTitle note="출석 2배 날과 오늘의 공식전 문항 현황. 문서 하나를 읽습니다.">이벤트</PageTitle>
      {error && <ErrorText>{error}</ErrorText>}
      {status && (
        <p role="status" className="text-sm" style={{ color: 'var(--on-base)' }}>
          {status}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          label="공식전 남은 문항"
          value={official ? `${official.remaining}개` : '—'}
          hint={
            official
              ? `${official.daysLeft}일 치 · 거절한 줄 ${official.problems}개${official.short.length > 0 ? ` · 못 만든 날 ${official.short.join(', ')}` : ''} · ${fmtTime(official.updatedAt)} 기준`
              : '운영자 PC 작업이 아직 문항 풀을 읽지 않았어요(ops/official/pool.csv).'
          }
        />
        <StatCard label="출석 2배 날" value={`${days.length}일`} hint="그날 출석이 10점 → 20점" />
      </div>

      <section aria-labelledby="double-title" className="sticker flex flex-col gap-3 p-4">
        <h2 id="double-title" className="font-semibold">
          출석 2배 날
        </h2>
        {days.length === 0 ? (
          <p className="text-sm text-ink-2">정한 날이 없어요.</p>
        ) : (
          <ul aria-label="출석 2배 날 목록" className="flex flex-wrap gap-2">
            {days.map((day) => (
              <li key={day} className="flex items-center gap-1 rounded-full border px-3 text-sm" style={line}>
                {day}
                {day >= todayKst() && (
                  <button type="button" aria-label={`${day} 빼기`} className="min-h-11 min-w-11 font-semibold" onClick={() => setDays(days.filter((item) => item !== day))}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            날짜
            <input type="date" value={pick} min={todayKst()} onChange={(event) => setPick(event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
          <button type="button" onClick={add} className="min-h-11 rounded-option border-2 px-4 font-semibold" style={line}>
            더하기
          </button>
          <button type="button" disabled={busy || !changed} onClick={() => void save()} className="min-h-11 rounded-option px-4 font-semibold disabled:opacity-50" style={primary}>
            저장
          </button>
        </div>
        <p className="text-xs text-ink-2 break-keep">
          저장은 관리자 기록에 남아요. 이용자 앱의 "오늘은 출석 2배!"·달력 표시·포인트는 다음 새벽(03:30) 등수 작업부터 바뀌어요.
        </p>
      </section>
    </>
  );
}
