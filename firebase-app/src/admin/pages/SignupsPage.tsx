import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { MEMBER_STATUS_LABEL, STUCK_SIGNUP_MS, emailUnverified, funnelOf, memberStatus } from '@/lib/admin/views';
import { EmailReveal } from './MembersPage';
import { useView, ViewBar } from '../useView';
import { logView, rebuildMembers, type MembersView } from '../views';
import { PageTitle, StatCard, fmtTime, line } from '../ui';

type Filter = 'unfinished' | 'stuck' | 'email-unverified' | 'all';
const FILTER_LABEL: Record<Filter, string> = {
  unfinished: '가입이 덜 끝남',
  stuck: '3일 넘게 멈춤',
  'email-unverified': '이메일 미인증',
  all: '전체',
};

/**
 * 가입 확인(점검 목록) — 승인이 아니라 가입이 끝까지 됐는지 본다. 회원 보기 하나만 읽는다(읽기 1).
 * 가입 시도가 실패해 계정이 안 생긴 경우는 여기 보이지 않는다(가입 화면 문제는 E2E·콘솔로).
 */
export function SignupsPage() {
  const { view, busy, error, refresh } = useView<MembersView>('members', rebuildMembers);
  const [filter, setFilter] = useState<Filter>('unfinished');
  const logged = useRef(false);
  const now = Date.now();

  useEffect(() => {
    if (!view || logged.current) return;
    logged.current = true;
    void logView('view-signups', 'members', `${view.data.rows.length}명`).catch(() => undefined);
  }, [view]);

  const all = view?.data.rows ?? [];
  const unfinished = (row: (typeof all)[number]) => ['needs-age', 'needs-profile'].includes(memberStatus(row, now));
  const stuck = (row: (typeof all)[number]) => row.ageConfirmedAt === null && row.createdAt < now - STUCK_SIGNUP_MS;
  const test: Record<Filter, (row: (typeof all)[number]) => boolean> = {
    unfinished,
    stuck,
    'email-unverified': emailUnverified,
    all: () => true,
  };
  const shown = all.filter(test[filter]);
  const funnel = funnelOf(all);

  return (
    <>
      <PageTitle note="승인이 아니라 점검입니다. '14세 미확인'·'프로필 미완료' 회원은 앱이 기록을 막아 둔 상태예요.">가입 확인</PageTitle>
      <ViewBar updatedAt={view?.updatedAt ?? null} busy={busy} error={error} onRefresh={() => void refresh()} cost="계정 사본·프로필·누적 기록을 회원 수 × 3 읽습니다" />
      {view === undefined && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {view && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="가입" value={funnel.signedUp} />
            <StatCard label="14세 확인" value={funnel.ageConfirmed} />
            <StatCard label="프로필" value={funnel.profile} />
            <StatCard label="레벨 테스트" value={funnel.levelTest} />
            <StatCard label="첫 경기" value={funnel.firstGame} />
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="점검 거르기">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-11 rounded-option border-2 px-3 text-sm font-semibold ${filter === value ? '' : 'text-ink-2'}`}
                style={filter === value ? { borderColor: 'var(--accent)' } : line}
              >
                {FILTER_LABEL[value]} {all.filter(test[value]).length}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-ink-2">해당하는 회원이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="가입 점검 목록">
              {shown.map((row) => (
                <li key={row.uid} className="sticker flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span className="flex flex-col">
                    <Link to={`/members/${row.uid}`} className="font-semibold underline">
                      {row.nickname ?? '(닉네임 없음)'}
                    </Link>
                    <span className="flex flex-wrap items-center gap-1 text-ink-2">
                      <EmailReveal uid={row.uid} email={row.email} /> · 가입 {fmtTime(row.createdAt)}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <span className="rounded-full border px-2 py-0.5 text-xs" style={line}>
                      {MEMBER_STATUS_LABEL[memberStatus(row, now)]}
                    </span>
                    {stuck(row) && (
                      <span className="rounded-full border-2 px-2 py-0.5 text-xs" style={{ borderColor: 'var(--out)' }}>
                        3일 넘게 멈춤
                      </span>
                    )}
                    {emailUnverified(row) && (
                      <span className="rounded-full border px-2 py-0.5 text-xs" style={line}>
                        이메일 미인증
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
