import { useState } from 'react';
import { Link } from 'react-router';
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
