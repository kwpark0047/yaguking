import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { maskEmail } from '@/lib/admin/access';
import { memberDataOpen } from '@/lib/admin/policyGate';
import { SIGNUP_STATUS_LABEL, signupCheck, summarize, type SignupStatus } from '@/lib/admin/signupCheck';
import { loadMembers, type MemberRow } from '../data';
import { ErrorText, PageTitle, StatCard, fmtTime, line } from '../ui';
import { ClosedNotice } from './MembersPage';

type Filter = 'all' | SignupStatus | 'email-unverified';

/**
 * 가입 확인(점검 목록) — 관리자가 승인하는 게 아니라, 가입이 끝까지 됐는지 본다(docs/admin-plan.md §5.2).
 * 최근 가입 100명. 가입 시도가 실패해 계정이 안 생긴 경우는 여기 보이지 않는다(가입 화면 문제는 E2E·콘솔로).
 */
export function SignupsPage() {
  if (!memberDataOpen()) return <ClosedNotice title="가입 확인" />;
  return <SignupChecks />;
}

function SignupChecks() {
  const [rows, setRows] = useState<MemberRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMembers(null, 100)
      .then((page) => setRows(page.rows))
      .catch(() => setError('불러오지 못했어요.'));
  }, []);

  const checked = useMemo(() => (rows ?? []).map((row) => ({ row, check: signupCheck(row.mirror, row.profile) })), [rows]);
  const summary = summarize(checked.map((item) => item.check));
  const shown = checked.filter(({ check }) =>
    filter === 'all' ? true : filter === 'email-unverified' ? check.emailUnverified : check.status === filter,
  );

  const filters: [Filter, string, number][] = [
    ['all', '전체', summary.total],
    ['needs-age', SIGNUP_STATUS_LABEL['needs-age'], summary.needsAge],
    ['needs-profile', SIGNUP_STATUS_LABEL['needs-profile'], summary.needsProfile],
    ['complete', SIGNUP_STATUS_LABEL.complete, summary.complete],
    ['email-unverified', '이메일 미인증', summary.emailUnverified],
  ];

  return (
    <>
      <PageTitle note="승인이 아니라 점검입니다. '만 14세 확인 안 함'·'프로필 미완료' 회원은 앱이 기록을 막아 둔 상태예요.">가입 확인</PageTitle>
      {error && <ErrorText>{error}</ErrorText>}
      {!rows && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {rows && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="최근 가입" value={summary.total} hint="계정 사본 기준 최대 100명" />
            <StatCard label="가입 완료" value={summary.complete} />
            <StatCard label="만 14세 확인 안 함" value={summary.needsAge} />
            <StatCard label="프로필 미완료" value={summary.needsProfile} />
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label="상태로 거르기">
            {filters.map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-11 rounded-option border-2 px-3 text-sm font-semibold ${filter === value ? '' : 'text-ink-2'}`}
                style={filter === value ? { borderColor: 'var(--accent)' } : line}
              >
                {label} {count}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-ink-2">해당하는 회원이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="가입 점검 목록">
              {shown.map(({ row, check }) => (
                <li key={row.uid} className="sticker flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span className="flex flex-col">
                    <Link to={`/members/${row.uid}`} className="font-semibold underline">
                      {row.profile?.nickname ?? '(닉네임 없음)'}
                    </Link>
                    <span className="text-ink-2">
                      {maskEmail(row.email)} · 가입 {fmtTime(row.mirror.createdAt)}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <span className="rounded-full border px-2 py-0.5 text-xs" style={line}>
                      {SIGNUP_STATUS_LABEL[check.status]}
                    </span>
                    {check.emailUnverified && (
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
