import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CATEGORY_TITLE, loadQuestions, type Question } from '@/content/questions';
import { GUEST_BURST_PER_HOUR, sumDays, type DailyRow } from '@/lib/admin/views';
import { requestAccountSync } from '../data';
import { useView, ViewBar } from '../useView';
import { rebuildAll, type DashboardView } from '../views';
import { ErrorText, PageTitle, StatCard, fmtTime, line } from '../ui';

/**
 * 대시보드 — 열 때 보기 문서 하나만 읽는다(docs/admin-dashboard-plan.md §1). "새로 만들기"는 회원·오늘 경기·대결 방
 * 보기를 모두 다시 만들고 그 요약을 여기에 모은다. 숫자를 누르면 세부 화면.
 */
export function DashboardPage() {
  const { view, busy, error, refresh } = useView<DashboardView>('dashboard', rebuildAll);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const data = view?.data;

  async function sync() {
    setNotice(null);
    setSyncError(null);
    try {
      await requestAccountSync();
      setNotice('동기화를 요청했어요. 운영자 PC 작업이 처리합니다(매일 03:30, 또는 PC에서 바로 실행).');
    } catch {
      setSyncError('요청하지 못했어요.');
    }
  }

  const look = data
    ? [
        data.rooms?.stalled ? { to: '/rooms', text: `진행 멈춘 방 ${data.rooms.stalled}` } : null,
        data.rooms?.expired ? { to: '/rooms', text: `정리할 지난 방 ${data.rooms.expired}` } : null,
        data.members?.stuckSignups ? { to: '/signups', text: `14세 확인 안 하고 3일 지난 가입 ${data.members.stuckSignups}` } : null,
        data.games?.flagged ? { to: '/games', text: `이상 징후 경기 ${data.games.flagged}` } : null,
        (data.members?.guestsPeakHour ?? 0) > GUEST_BURST_PER_HOUR
          ? { to: '/', text: `비회원 급증: 한 시간에 ${data.members?.guestsPeakHour}개(최근 24시간 ${data.members?.guestsNew24h})` }
          : null,
      ].filter((item): item is { to: string; text: string } => item !== null)
    : [];

  return (
    <>
      <PageTitle>대시보드</PageTitle>
      <ViewBar
        updatedAt={view?.updatedAt ?? null}
        busy={busy}
        error={error}
        onRefresh={() => void refresh()}
        cost="회원·오늘 경기·대결 방 원본을 모두 읽습니다(회원 수 × 3 + 오늘 경기 + 방·자리)"
      />
      {view === undefined && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Link to="/members" className="block">
              <StatCard label="회원" value={data.members?.members ?? '—'} hint={data.members ? `오늘 가입 ${data.members.signupsToday} · 계정 ${data.members.accounts}` : undefined} />
            </Link>
            <Link to="/games" className="block">
              <StatCard label="오늘 경기" value={data.games?.games ?? '—'} hint={data.games ? `회원 ${data.games.memberGames} · 비회원 ${data.games.guestGames} · ${data.games.players}명` : undefined} />
            </Link>
            <Link to="/rooms" className="block">
              <StatCard label="대결 방" value={data.rooms?.rooms ?? '—'} hint={data.rooms ? `대기 ${data.rooms.waiting} · 진행 ${data.rooms.playing} · 끝 ${data.rooms.finished}` : undefined} />
            </Link>
            <StatCard
              label="비회원"
              value={data.members?.guests ?? '—'}
              hint={data.members?.guests == null ? '계정 동기화 전' : `최근 7일 활동 ${data.members.guestsActive7d} · 동기화 ${fmtTime(data.members.syncedAt)}`}
            />
            <StatCard label="처리 대기 작업" value={data.system?.pendingTasks ?? '—'} hint="운영자 PC 작업이 처리" />
          </div>

          {look.length > 0 && (
            <section aria-labelledby="look-title" className="flex flex-col gap-2">
              <h2 id="look-title" className="font-semibold">
                살펴볼 것
              </h2>
              <ul className="flex flex-wrap gap-2">
                {look.map((item) => (
                  <li key={item.text}>
                    <Link to={item.to} className="flex min-h-11 items-center rounded-option border-2 px-3 text-sm underline" style={{ borderColor: 'var(--out)' }}>
                      {item.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.members && (
            <section aria-labelledby="funnel-title" className="sticker flex flex-col gap-2 p-4">
              <h2 id="funnel-title" className="font-semibold">
                가입 단계
              </h2>
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                {[
                  ['가입', data.members.funnel.signedUp],
                  ['14세 확인', data.members.funnel.ageConfirmed],
                  ['프로필', data.members.funnel.profile],
                  ['레벨 테스트', data.members.funnel.levelTest],
                  ['첫 경기', data.members.funnel.firstGame],
                ].map(([label, count], index) => (
                  <li key={label} className="flex items-center gap-2">
                    {index > 0 && <span aria-hidden="true">→</span>}
                    <span>
                      {label} <span className="num-tabular font-bold">{count}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <PeriodSummary data={data} />

          {data.games && (
            <section aria-labelledby="games-title" className="sticker flex flex-col gap-3 p-4">
              <h2 id="games-title" className="font-semibold">
                오늘 경기 요약 <span className="text-xs font-normal text-ink-2">비공식 · {fmtTime(data.games.builtAt)} 기준</span>
              </h2>
              <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                {[
                  ['평균 득점', data.games.averageRuns],
                  ['평균 타석', data.games.averagePa],
                  ['정답률', `${Math.round(data.games.correctRate * 100)}%`],
                  ['홈런 비율', `${Math.round(data.games.homeRunRate * 100)}%`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-ink-2">{label}</dt>
                    <dd className="num-tabular text-lg font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
              <HourBars hourly={data.games.hourly} />
            </section>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void sync()} className="min-h-11 rounded-option border-2 px-4 text-sm font-semibold" style={line}>
          계정 동기화 요청
        </button>
      </div>
      {syncError && <ErrorText>{syncError}</ErrorText>}
      {notice && (
        <p role="status" className="text-sm break-keep">
          {notice}
        </p>
      )}
      <p className="text-xs text-ink-2 break-keep">
        실제 무료 사용량은 Firebase 콘솔 › 사용량에서 확인하세요. 점수·경기 수는 기기에서 채점한 비공식 기록입니다.
      </p>
    </>
  );
}

/** 0~23시 경기 수 막대 — 표로도 읽히게(화면 읽기) */
export function HourBars({ hourly }: { hourly: readonly number[] }) {
  const max = Math.max(1, ...hourly);
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs text-ink-2">시간대별 경기 수(한국 시간)</figcaption>
      <div className="flex h-16 items-end gap-0.5" aria-hidden="true">
        {hourly.map((count, hour) => (
          <span
            key={hour}
            title={`${hour}시 ${count}`}
            className="flex-1 rounded-t"
            style={{ height: `${Math.max(count ? 8 : 2, (count / max) * 100)}%`, backgroundColor: count ? 'var(--accent)' : 'var(--line)' }}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-ink-2" aria-hidden="true">
        <span>0시</span>
        <span>12시</span>
        <span>23시</span>
      </div>
      <p className="sr-only">
        {hourly.map((count, hour) => (count ? `${hour}시 ${count}경기` : null)).filter(Boolean).join(', ') || '오늘 경기 없음'}
      </p>
    </figure>
  );
}

type Period = 'yesterday' | 'week';

/** 어제·최근 7일 — 운영자 PC가 매일 밤 쓴 하루 요약(adminDaily). 오늘 숫자는 아래 "오늘 경기 요약" */
function PeriodSummary({ data }: { data: DashboardView }) {
  const [period, setPeriod] = useState<Period>('yesterday');
  const [bank, setBank] = useState<Map<string, Question> | null>(null);
  useEffect(() => {
    loadQuestions()
      .then((questions) => setBank(new Map(questions.map((question) => [question.id, question]))))
      .catch(() => setBank(new Map()));
  }, []);
  const days = data.daily?.days ?? [];
  if (!data.daily) return null;
  if (days.length === 0)
    return (
      <section aria-labelledby="period-title" className="sticker flex flex-col gap-1 p-4">
        <h2 id="period-title" className="font-semibold">
          어제·최근 7일
        </h2>
        <p className="text-sm text-ink-2 break-keep">아직 하루 요약이 없어요. 운영자 PC 작업이 매일 03:30에 전날 요약을 만듭니다.</p>
      </section>
    );
  const chosen: DailyRow[] = period === 'yesterday' ? days.slice(0, 1) : days;
  const total = sumDays(chosen);
  const label = (day: string) => `${day.slice(4, 6)}-${day.slice(6, 8)}`;
  const maxGames = Math.max(1, ...days.map((day) => day.games));
  return (
    <section aria-labelledby="period-title" className="sticker flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="period-title" className="font-semibold">
          {period === 'yesterday' ? `어제(${label(days[0]!.day)})` : `최근 ${days.length}일`}{' '}
          <span className="text-xs font-normal text-ink-2">비공식 · 매일 밤 요약</span>
        </h2>
        <div className="flex gap-1" role="group" aria-label="기간">
          {(['yesterday', 'week'] as Period[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={period === value}
              onClick={() => setPeriod(value)}
              className={`min-h-11 rounded-option border-2 px-3 text-sm font-semibold ${period === value ? '' : 'text-ink-2'}`}
              style={period === value ? { borderColor: 'var(--accent)' } : line}
            >
              {value === 'yesterday' ? '어제' : '최근 7일'}
            </button>
          ))}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
        {[
          ['경기', total.games],
          ['가입', total.signups],
          ['평균 득점', total.averageRuns],
          ['정답률', `${Math.round(total.correctRate * 100)}%`],
          ['홈런 비율', `${Math.round(total.homeRunRate * 100)}%`],
        ].map(([name, value]) => (
          <div key={name}>
            <dt className="text-ink-2">{name}</dt>
            <dd className="num-tabular text-lg font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      {period === 'week' ? (
        <figure className="flex flex-col gap-1">
          <figcaption className="text-xs text-ink-2">날짜별 경기 수</figcaption>
          <ol className="flex h-20 items-end gap-1" aria-label="날짜별 경기 수">
            {[...days].reverse().map((day) => (
              <li key={day.day} className="flex flex-1 flex-col items-center gap-1">
                <span className="num-tabular text-xs">{day.games}</span>
                <span
                  aria-hidden="true"
                  className="w-full rounded-t"
                  style={{ height: `${Math.max(day.games ? 8 : 2, (day.games / maxGames) * 48)}px`, backgroundColor: day.games ? 'var(--accent)' : 'var(--line)' }}
                />
                <span className="text-xs text-ink-2">{label(day.day)}</span>
              </li>
            ))}
          </ol>
        </figure>
      ) : (
        <HourBars hourly={total.hourly} />
      )}
      {period === 'week' && (data.daily.hardest.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold">최근 7일 많이 틀린 문항(5번 이상 나온 것)</h3>
          <ol className="flex flex-col gap-1 text-sm">
            {data.daily.hardest.map((item) => {
              const question = bank?.get(item.questionId);
              return (
                <li key={item.questionId}>
                  <span className="num-tabular font-semibold">{Math.round(item.rate * 100)}%</span> ({item.shown}번) ·{' '}
                  {question ? `${CATEGORY_TITLE[question.category]} · ${question.stem}` : item.questionId}
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-ink-2 break-keep">고칠 문항은 문제은행 CSV를 고쳐 다시 배포합니다.</p>
        </div>
      ) : (
        <p className="text-xs text-ink-2">5번 이상 나온 문항이 아직 없어요.</p>
      ))}
    </section>
  );
}
