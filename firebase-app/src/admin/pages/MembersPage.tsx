import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { TEAMS } from '@/content/teams';
import { maskEmail } from '@/lib/admin/access';
import { MEMBER_STATUS_LABEL, emailUnverified, memberStatus, type MemberStatus, type MemberViewRow } from '@/lib/admin/views';
import { tierTheme } from '@/lib/theme/tiers';
import { loadRecentGames, type RecentGame } from '../data';
import { useView, ViewBar } from '../useView';
import { logView, readView, rebuildMembers, type MembersView, type View } from '../views';
import { ErrorText, PageTitle, field, fmtTime, line } from '../ui';

const teamName = (slug: string) => TEAMS.find((team) => team.slug === slug)?.shortName ?? slug;
const providerName = (id: string) => ({ 'google.com': '구글', password: '이메일' })[id] ?? id;
const DAY = 86_400_000;

type Period = 'all' | '1' | '7' | '30';
type Sort = 'signup' | 'login' | 'games';

/**
 * 회원 확인(docs/admin-dashboard-plan.md §2) — 열 때 회원 보기 하나만 읽는다(읽기 1). 거르기·정렬은 화면에서.
 * 열 때·이메일을 볼 때·상세를 열 때 관리자 기록을 남긴다(개인정보 접속기록, 2년). 이메일은 기본 가림.
 */
export function MembersPage() {
  const { view, busy, error, refresh } = useView<MembersView>('members', rebuildMembers);
  const [status, setStatus] = useState<'all' | MemberStatus | 'email-unverified'>('all');
  const [provider, setProvider] = useState('all');
  const [team, setTeam] = useState('all');
  const [period, setPeriod] = useState<Period>('all');
  const [sort, setSort] = useState<Sort>('signup');
  const [search, setSearch] = useState('');
  useViewLog(view, 'view-members');
  const now = Date.now();

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = (view?.data.rows ?? []).filter((row) => {
      if (status === 'email-unverified' ? !emailUnverified(row) : status !== 'all' && memberStatus(row, now) !== status) return false;
      if (provider !== 'all' && !row.providers.includes(provider)) return false;
      if (team !== 'all' && row.favoriteTeams[0] !== team) return false;
      if (period !== 'all' && row.createdAt < now - Number(period) * DAY) return false;
      if (query && !(row.nickname ?? '').toLowerCase().startsWith(query)) return false;
      return true;
    });
    const key = (row: MemberViewRow) => (sort === 'login' ? row.lastSignInAt : sort === 'games' ? row.games : row.createdAt);
    return list.sort((a, b) => key(b) - key(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, status, provider, team, period, sort, search]);

  const select = (label: string, value: string, onChange: (value: string) => void, options: [string, string][]) => (
    <label className="flex flex-col gap-1 text-sm">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 rounded-option border px-2" style={field}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <PageTitle note="이메일은 가려서 보여 주고, 보기를 누를 때마다 관리자 기록에 남습니다.">가입자</PageTitle>
      <ViewBar updatedAt={view?.updatedAt ?? null} busy={busy} error={error} onRefresh={() => void refresh()} cost="계정 사본·프로필·누적 기록을 회원 수 × 3 읽습니다" />
      {view === undefined && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {view && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {select('상태', status, (value) => setStatus(value as typeof status), [
              ['all', '전체'],
              ...(Object.keys(MEMBER_STATUS_LABEL) as MemberStatus[]).map((value) => [value, MEMBER_STATUS_LABEL[value]] as [string, string]),
              ['email-unverified', '이메일 미인증'],
            ])}
            {select('로그인 수단', provider, setProvider, [
              ['all', '전체'],
              ['google.com', '구글'],
              ['password', '이메일'],
            ])}
            {select('최애 구단', team, setTeam, [['all', '전체'], ...TEAMS.map((item) => [item.slug, item.shortName] as [string, string])])}
            {select('가입', period, (value) => setPeriod(value as Period), [
              ['all', '전체'],
              ['1', '최근 1일'],
              ['7', '최근 7일'],
              ['30', '최근 30일'],
            ])}
            {select('정렬', sort, (value) => setSort(value as Sort), [
              ['signup', '가입순'],
              ['login', '마지막 로그인순'],
              ['games', '경기 수순'],
            ])}
            <label className="flex flex-col gap-1 text-sm">
              닉네임 앞글자
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
            </label>
          </div>
          <p className="text-sm text-ink-2" role="status">
            {rows.length}명 / 계정 {view.data.rows.length}
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-ink-2">해당하는 회원이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="가입자 목록">
              {rows.map((row) => (
                <MemberLine key={row.uid} row={row} now={now} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

/** 보기를 처음 받았을 때 한 번 관리자 기록 */
function useViewLog(view: View<MembersView> | null | undefined, action: string, target = 'members') {
  const logged = useRef(false);
  useEffect(() => {
    if (!view || logged.current) return;
    logged.current = true;
    void logView(action, target, `${view.data.rows.length}명`).catch(() => undefined);
  }, [view, action, target]);
}

function MemberLine({ row, now }: { row: MemberViewRow; now: number }) {
  const status = memberStatus(row, now);
  return (
    <li className="sticker flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
      <span className="flex flex-col gap-0.5">
        <Link to={`/members/${row.uid}`} className="font-semibold underline">
          {row.nickname ?? '(닉네임 없음)'}
        </Link>
        <span className="flex flex-wrap items-center gap-1 text-ink-2">
          <EmailReveal uid={row.uid} email={row.email} /> · {row.providers.map(providerName).join('·') || '—'} · 가입 {fmtTime(row.createdAt)}
        </span>
      </span>
      <span className="flex flex-wrap gap-1">
        <span className="rounded-full border px-2 py-0.5 text-xs" style={line}>
          {MEMBER_STATUS_LABEL[status]}
        </span>
        {emailUnverified(row) && (
          <span className="rounded-full border px-2 py-0.5 text-xs" style={line}>
            이메일 미인증
          </span>
        )}
        {row.admin && (
          <span className="rounded-full border px-2 py-0.5 text-xs" style={line}>
            관리자
          </span>
        )}
      </span>
    </li>
  );
}

/** 가린 이메일 + "보기"(누를 때마다 관리자 기록) */
export function EmailReveal({ uid, email }: { uid: string; email: string | null }) {
  const [shown, setShown] = useState(false);
  const [error, setError] = useState(false);
  if (!email) return <span>(이메일 없음)</span>;
  if (shown) return <span>{email}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {maskEmail(email)}
      <button
        type="button"
        onClick={() => {
          logView('view-email', uid)
            .then(() => setShown(true))
            .catch(() => setError(true));
        }}
        className="min-h-11 px-1 text-xs underline"
        aria-label={`${maskEmail(email)} 이메일 보기`}
      >
        {error ? '다시 보기' : '보기'}
      </button>
    </span>
  );
}

/** 회원 한 명 — 회원 보기에서 찾는다(읽기 1). 열 때 관리자 기록. 최근 경기는 누를 때만 읽는다 */
export function MemberDetailPage() {
  const { uid = '' } = useParams();
  const [view, setView] = useState<View<MembersView> | null | undefined>(undefined);
  const [games, setGames] = useState<RecentGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logged = useRef(false);

  useEffect(() => {
    readView<MembersView>('members')
      .then(setView)
      .catch(() => setError('불러오지 못했어요.'));
  }, []);

  const row = view?.data.rows.find((item) => item.uid === uid) ?? null;

  useEffect(() => {
    if (!row || logged.current) return;
    logged.current = true;
    void logView('view-member', uid).catch(() => undefined);
  }, [row, uid]);

  async function showGames() {
    setError(null);
    try {
      setGames(await loadRecentGames(uid));
    } catch {
      setError('경기를 불러오지 못했어요.');
    }
  }

  if (error && !row) return <ErrorText>{error}</ErrorText>;
  if (view === undefined) return <p className="text-sm text-ink-2">불러오는 중…</p>;
  if (!row)
    return (
      <>
        <p className="text-sm">회원 보기에 없는 사람이에요. 가입자 화면에서 새로 만들기를 눌러 보세요.</p>
        <Link to="/members" className="underline">
          가입자로
        </Link>
      </>
    );

  const now = Date.now();
  const timeline: [string, number | null][] = [
    ['가입', row.createdAt || null],
    ['만 14세 확인', row.ageConfirmedAt],
    ['레벨 테스트', row.levelTest?.at ?? null],
    ['마지막 경기', row.lastGameAt],
    ['마지막 로그인', row.lastSignInAt || null],
  ];

  return (
    <>
      <Link to="/members" className="text-sm underline">
        ◀ 가입자 목록
      </Link>
      <PageTitle note={`${fmtTime(view?.updatedAt)}에 만든 회원 보기 기준 · 이 화면을 연 것이 관리자 기록에 남았습니다.`}>
        {row.nickname ?? '(닉네임 없음)'}
      </PageTitle>
      <dl className="sticker grid grid-cols-1 gap-2 p-4 text-sm md:grid-cols-2">
        {[
          ['상태', `${MEMBER_STATUS_LABEL[memberStatus(row, now)]}${emailUnverified(row) ? ' · 이메일 미인증' : ''}${row.disabled ? ' · 사용 중지' : ''}`],
          ['로그인 수단', row.providers.map(providerName).join('·') || '—'],
          ['최애 구단', row.favoriteTeams.map(teamName).join(' > ') || '—'],
          ['처음 등급', row.levelTest ? `Lv.${row.levelTest.tier} ${tierTheme(row.levelTest.tier).name} (${row.levelTest.correct}/${row.levelTest.total})` : '레벨 테스트 전'],
          ['누적(비공식)', `${row.games}경기 · 타율 ${row.atBats ? (row.hits / row.atBats).toFixed(3).replace(/^0/, '') : '—'} · 홈런 ${row.homeRuns}`],
          ['uid', row.uid],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-ink-2">{label}</dt>
            <dd className="break-all">{value}</dd>
          </div>
        ))}
        <div className="flex flex-col">
          <dt className="text-ink-2">이메일</dt>
          <dd>
            <EmailReveal uid={row.uid} email={row.email} />
          </dd>
        </div>
      </dl>
      <section aria-labelledby="timeline-title" className="flex flex-col gap-2">
        <h2 id="timeline-title" className="font-semibold">
          타임라인
        </h2>
        <ol className="flex flex-col gap-1 text-sm">
          {timeline.map(([label, at]) => (
            <li key={label} className="flex gap-2">
              <span className="num-tabular w-36 text-ink-2">{fmtTime(at)}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="games-title" className="flex flex-col gap-2">
        <h2 id="games-title" className="font-semibold">
          최근 경기
        </h2>
        {games === null ? (
          <button type="button" onClick={() => void showGames()} className="min-h-11 self-start rounded-option border-2 px-4 text-sm font-semibold" style={line}>
            최근 경기 10개 보기(읽기 10)
          </button>
        ) : games.length === 0 ? (
          <p className="text-sm text-ink-2">경기가 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {games.map((game) => (
              <li key={game.id} className="num-tabular">
                {fmtTime(game.createdAt)} · {game.mode === 'levelTest' ? '레벨 테스트' : '개인 경기'} · 타석 {game.pa} · 정답 {game.correct} · 득점 {game.runs}
              </li>
            ))}
          </ul>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </section>
      <p className="text-xs text-ink-2 break-keep">닉네임 초기화·계정 삭제 같은 조치는 이용약관이 확정된 뒤에 엽니다. 기록·점수는 고치지 않습니다.</p>
    </>
  );
}
