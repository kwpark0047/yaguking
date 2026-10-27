import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { maskEmail } from '@/lib/admin/access';
import { MEMBER_DATA_CLOSED_MESSAGE, memberDataOpen } from '@/lib/admin/policyGate';
import { SIGNUP_STATUS_LABEL, signupCheck } from '@/lib/admin/signupCheck';
import { TEAMS } from '@/content/teams';
import { tierTheme } from '@/lib/theme/tiers';
import {
  loadMemberDetail,
  loadMembers,
  logAdmin,
  searchByNickname,
  type MemberDetail,
  type MemberPage,
  type MemberRow,
} from '../data';
import { ErrorText, PageTitle, field, fmtTime, line } from '../ui';

const teamName = (slug: string) => TEAMS.find((team) => team.slug === slug)?.shortName ?? slug;
const providerName = (id: string) => ({ 'google.com': '구글', password: '이메일' })[id] ?? id;

/** 가입자 목록 — 계정 사본(운영자 PC 동기화) 기준 최근 가입 순 30명씩, 닉네임 앞글자 검색. 이메일은 가려서 */
export function MembersPage() {
  if (!memberDataOpen()) return <ClosedNotice title="가입자" />;
  return <MembersList />;
}

/** 처리방침 개정 시행 전에는 회원 정보를 열지 않는다(운영 빌드) */
export function ClosedNotice({ title }: { title: string }) {
  return (
    <>
      <PageTitle>{title}</PageTitle>
      <p role="note" className="sticker p-4 text-sm break-keep">
        {MEMBER_DATA_CLOSED_MESSAGE}
      </p>
    </>
  );
}

function MembersList() {
  const [page, setPage] = useState<MemberPage | null>(null);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<MemberRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMembers()
      .then((first) => {
        setPage(first);
        setRows(first.rows);
      })
      .catch(() => setError('가입자를 불러오지 못했어요.'));
  }, []);

  async function more() {
    if (!page?.cursor) return;
    const next = await loadMembers(page.cursor);
    setPage(next);
    setRows((current) => [...current, ...next.rows]);
  }

  async function find(event: FormEvent) {
    event.preventDefault();
    if (!search.trim()) return setResults(null);
    try {
      setResults(await searchByNickname(search.trim()));
    } catch {
      setError('검색하지 못했어요.');
    }
  }

  const shown = results ?? rows;
  return (
    <>
      <PageTitle note="계정 사본은 운영자 PC 작업이 매일 동기화합니다. 이메일은 가려 보여 주고, 회원을 열면 관리자 기록에 남습니다.">가입자</PageTitle>
      <form onSubmit={(event) => void find(event)} className="flex gap-2" role="search">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          닉네임 앞글자로 찾기
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
        </label>
        <button type="submit" className="min-h-11 self-end rounded-option border-2 px-4 text-sm font-semibold" style={line}>
          찾기
        </button>
      </form>
      {error && <ErrorText>{error}</ErrorText>}
      {results && <p className="text-sm text-ink-2">검색 결과 {results.length}명</p>}
      {!page && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {page && shown.length === 0 && <p className="text-sm text-ink-2">{results ? '찾은 회원이 없어요.' : '계정 사본이 아직 없어요. 대시보드에서 계정 동기화를 요청해 주세요.'}</p>}
      {shown.length > 0 && (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="가입자 목록">
          <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                {['닉네임', '이메일', '로그인', '가입', '마지막 로그인', '상태'].map((head) => (
                  <th key={head} scope="col" className="border-b-2 px-2 py-2" style={line}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const check = signupCheck(row.mirror, row.profile);
                return (
                  <tr key={row.uid}>
                    <th scope="row" className="border-b px-2 py-2 font-medium" style={line}>
                      <Link to={`/members/${row.uid}`} className="underline">
                        {row.profile?.nickname ?? '(닉네임 없음)'}
                      </Link>
                    </th>
                    <td className="border-b px-2 py-2" style={line}>{maskEmail(row.email)}</td>
                    <td className="border-b px-2 py-2" style={line}>{row.mirror.providers.map(providerName).join(', ') || '—'}</td>
                    <td className="num-tabular border-b px-2 py-2" style={line}>{fmtTime(row.mirror.createdAt)}</td>
                    <td className="num-tabular border-b px-2 py-2" style={line}>{fmtTime(row.mirror.lastSignInAt)}</td>
                    <td className="border-b px-2 py-2" style={line}>{SIGNUP_STATUS_LABEL[check.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!results && page?.cursor && (
        <button type="button" onClick={() => void more()} className="min-h-11 self-start rounded-option border-2 px-4 text-sm font-semibold" style={line}>
          더 보기
        </button>
      )}
    </>
  );
}

/** 회원 한 명 — 연 순간 관리자 기록. 이메일 보기도 기록. 1차는 읽기만(삭제는 다음 단계) */
export function MemberDetailPage() {
  if (!memberDataOpen()) return <ClosedNotice title="회원" />;
  return <MemberDetail />;
}

function MemberDetail() {
  const { uid = '' } = useParams();
  const [detail, setDetail] = useState<MemberDetail | null | undefined>(undefined);
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMemberDetail(uid)
      .then(setDetail)
      .catch(() => setError('회원을 불러오지 못했어요.'));
  }, [uid]);

  async function revealEmail() {
    if (!detail) return;
    try {
      await logAdmin('view-email', uid);
      setEmail(detail.row.email ?? '(이메일 없음)');
    } catch {
      setError('기록을 남기지 못해 이메일을 보여 주지 않았어요.');
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (detail === undefined) return <p className="text-sm text-ink-2">불러오는 중…</p>;
  if (detail === null) return <p className="text-sm">없는 회원이에요.</p>;

  const { row } = detail;
  const check = signupCheck(row.mirror, row.profile);
  const facts: [string, string][] = [
    ['uid', row.uid],
    ['로그인 수단', row.mirror.providers.map(providerName).join(', ') || '—'],
    ['이메일 인증', row.mirror.emailVerified ? '예' : '아니요'],
    ['가입', fmtTime(row.mirror.createdAt)],
    ['마지막 로그인', fmtTime(row.mirror.lastSignInAt)],
    ['가입 상태', SIGNUP_STATUS_LABEL[check.status]],
    ['최애 구단', row.profile?.favoriteTeams.map(teamName).join(' › ') || '—'],
    ['최애 선수', row.profile?.favoritePlayers.join(', ') || '—'],
    ['처음 등급', detail.levelTest ? `Lv.${detail.levelTest.tier} ${tierTheme(detail.levelTest.tier).name} (${detail.levelTest.correct}/${detail.levelTest.total})` : '레벨 테스트 전'],
    ['오답노트', `${detail.wrongNotes}문항`],
  ];

  return (
    <>
      <Link to="/members" className="flex min-h-11 items-center self-start text-sm underline">
        ← 가입자
      </Link>
      <PageTitle note="이 화면을 연 것과 이메일을 본 것은 관리자 기록에 남습니다. 1차에서는 보기만 할 수 있어요.">
        {row.profile?.nickname ?? '(닉네임 없음)'}
      </PageTitle>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-ink-2">이메일</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span>{email ?? maskEmail(row.email)}</span>
          {!email && row.email && (
            <button type="button" onClick={() => void revealEmail()} className="min-h-11 underline">
              이메일 보기(기록됨)
            </button>
          )}
        </dd>
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-2">{label}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="summary-title" className="flex flex-col gap-2">
        <h2 id="summary-title" className="text-lg font-semibold">누적 성적(비공식)</h2>
        {detail.summary ? (
          <p className="num-tabular text-sm">
            경기 {detail.summary.games ?? 0} · 타석 {detail.summary.pa ?? 0} · 안타 {detail.summary.h ?? 0} · 홈런 {detail.summary.hr ?? 0} · 득점{' '}
            {detail.summary.runs ?? 0} · XP {detail.summary.xp ?? 0}
          </p>
        ) : (
          <p className="text-sm text-ink-2">아직 경기 기록이 없어요.</p>
        )}
      </section>
      <section aria-labelledby="games-title" className="flex flex-col gap-2">
        <h2 id="games-title" className="text-lg font-semibold">최근 경기</h2>
        {detail.recentGames.length === 0 ? (
          <p className="text-sm text-ink-2">없음</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {detail.recentGames.map((game) => (
              <li key={game.id} className="num-tabular">
                {fmtTime(game.createdAt)} · {game.mode === 'levelTest' ? '레벨 테스트' : '개인 경기'} · 타석 {game.pa} · 득점 {game.runs}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
