import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import { LogoEditor } from '@/components/squad/LogoEditor';
import { SquadLogo } from '@/components/squad/SquadLogo';
import {
  dayText,
  DEFAULT_LOGO,
  defaultInitials,
  isSquadCode,
  kstDate,
  LEAGUE_REWARDS,
  LEAGUE_TOP,
  logoProblem,
  normalizeSquadCode,
  SQUAD_KINDS,
  SQUAD_MAX,
  SQUAD_MIN,
  SQUAD_REJOIN_DAYS,
  squadKindName,
  squadNameProblem,
  squadsOpen,
  squadStart,
  weekStartOf,
  type SquadKind,
  type SquadLogo as Logo,
} from '@/lib/squad/squad';
import {
  approveRequest,
  cancelRequest,
  createSquad,
  editSquad,
  kickMember,
  leaveSquad,
  loadMySquad,
  loadSquad,
  loadWeekContribution,
  rejectRequest,
  rejoinBlockedUntil,
  requestJoin,
  SquadError,
  type MySquad,
  type SquadView,
  type WeekContribution,
} from '@/lib/squad/squadApi';
import { copyText, shareOrCopy } from '@/lib/platform/share';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };
const line = { borderColor: 'var(--line)' };
const field = { borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' };

const squadLink = (code: string) => `${location.origin}/team?join=${code}&utm_source=share&utm_campaign=team`;
const errorText = (caught: unknown, fallback: string) => (caught instanceof SquadError ? caught.message : fallback);

/**
 * 팀(2단계) — 만들기(이름·종류·로고), 팀 코드·링크로 합류 신청, 내 팀(팀원·신청 승인·감독 일), 이번 주 팀 리그 기여(3단계).
 * 회원만(비회원은 가입 안내). 보호자 동의 계정(자녀)은 가족팀 합류만. 규칙이 마지막에 막는다(firestore.rules squads).
 */
export function SquadPage() {
  const { user, isGuest, profile, refreshProfile } = useAuth();
  const [params, setParams] = useSearchParams();
  const open = squadsOpen();
  const member = !!user && !isGuest && profile.status === 'ready' && profile.ageConfirmed;
  const data = profile.status === 'ready' ? profile.data : null;
  const child = data?.guardian === 'consented';
  const joinCode = normalizeSquadCode(params.get('join') ?? '');
  const [mine, setMine] = useState<MySquad | null>(null);
  const [preview, setPreview] = useState<SquadView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!user || !data) return;
    try {
      setMine(await loadMySquad(user.uid, data.squad));
    } catch {
      setError('팀 정보를 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요.');
    }
  }, [user, data]);

  useEffect(() => {
    if (open && member) void reload();
  }, [open, member, reload]);

  useEffect(() => {
    if (!open || !member || !isSquadCode(joinCode)) return;
    loadSquad(joinCode)
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [open, member, joinCode]);

  async function run(action: () => Promise<unknown>, done: string | null, fallback = '하지 못했어요. 다시 해 주세요.') {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await refreshProfile();
      if (done) setMessage(done);
    } catch (caught) {
      setError(errorText(caught, fallback));
    } finally {
      setBusy(false);
    }
  }

  // refreshProfile 뒤 data.squad가 바뀌면 reload가 다시 돈다
  const blockedUntil = rejoinBlockedUntil(data?.squadLeftAt ?? null);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">팀</h1>
      <p className="text-sm text-ink-2 break-keep">
        친구·동료·가족 {SQUAD_MIN}~{SQUAD_MAX}명이 팀을 만들어 주간 리그와 팀 대항전을 해요. 팀원 상위 {LEAGUE_TOP}명의 오늘의 공식전 점수로 매주 순위를 매기고,
        1~3위 팀에서 그 주에 한 번이라도 푼 팀원은 보너스 포인트 {LEAGUE_REWARDS.join('·')}P를 받아요(힌트에만, 월간 등수 제외).
      </p>

      {!open && (
        <p role="status" className="text-sm">
          팀은 {dayText(squadStart())}부터 열려요.
        </p>
      )}

      {open && !member && (
        <section className="sticker flex flex-col gap-3 p-4 break-keep">
          <p>팀은 회원만 만들고 들어갈 수 있어요.</p>
          <Link
            to={`/auth?mode=signup&returnTo=${encodeURIComponent(`/team${joinCode ? `?join=${joinCode}` : ''}`)}`}
            className="flex min-h-12 items-center justify-center rounded-option font-semibold"
            style={primary}
          >
            가입하기
          </Link>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}

      {open && member && !mine && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}

      {open && member && user && data && mine?.state === 'none' && (
        <>
          {preview && (
            <section aria-label="합류할 팀" className="sticker flex flex-col items-center gap-3 p-4 text-center">
              <SquadLogo logo={preview.logo} size={88} badge={preview.badge} label={`${preview.name} 로고`} />
              <p className="font-cute text-2xl">{preview.name}</p>
              <p className="text-sm text-ink-2">
                {squadKindName(preview.kind)} · {preview.size}/{SQUAD_MAX}명
              </p>
              <button
                type="button"
                disabled={busy || !!blockedUntil}
                onClick={() =>
                  void run(
                    () => requestJoin(user.uid, data.nickname ?? '', child, preview.code, data.squad),
                    '합류 신청을 보냈어요. 감독·코치가 승인하면 팀원이 돼요.',
                  ).then(() => setParams({}, { replace: true }))
                }
                className="squishy font-cute min-h-14 w-full text-xl disabled:opacity-60"
                style={primary}
              >
                이 팀에 합류 신청
              </button>
            </section>
          )}
          {blockedUntil && (
            <p className="text-sm text-ink-2" role="note">
              팀에서 나온 뒤 {SQUAD_REJOIN_DAYS}일 동안은 새 팀에 들어갈 수 없어요 — {dayText(kstDate(blockedUntil))}부터 돼요.
            </p>
          )}
          <JoinByCode
            disabled={busy || !!blockedUntil}
            onJoin={(code) =>
              run(() => requestJoin(user.uid, data.nickname ?? '', child, code, data.squad), '합류 신청을 보냈어요. 감독·코치가 승인하면 팀원이 돼요.')
            }
          />
          {child ? (
            <p className="text-sm text-ink-2 break-keep">보호자 동의 계정은 가족팀에만 들어갈 수 있어요. 가족에게 팀 코드를 받아 넣어 주세요.</p>
          ) : (
            <CreateSquad
              disabled={busy || !!blockedUntil}
              onCreate={(input) => run(() => createSquad(user.uid, data.nickname ?? '', input), '팀을 만들었어요! 팀 링크로 팀원을 불러 보세요.', '팀을 만들지 못했어요. 다시 해 주세요.')}
            />
          )}
        </>
      )}

      {open && member && user && mine?.state === 'pending' && (
        <section aria-label="합류 신청한 팀" className="sticker flex flex-col items-center gap-3 p-4 text-center">
          <SquadLogo logo={mine.squad.logo} size={88} label={`${mine.squad.name} 로고`} />
          <p className="font-cute text-2xl">{mine.squad.name}</p>
          <p className="text-sm break-keep">합류 신청을 보냈어요. 감독·코치가 승인하면 팀원이 돼요.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => cancelRequest(user.uid, mine.squad.code), '신청을 거뒀어요.')}
            className="min-h-11 text-sm underline"
          >
            신청 거두기
          </button>
        </section>
      )}

      {open && member && user && mine?.state === 'member' && <MyTeam uid={user.uid} mine={mine} busy={busy} run={run} />}
    </main>
  );
}

function JoinByCode({ disabled, onJoin }: { disabled: boolean; onJoin: (code: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void onJoin(code).then(() => setCode(''));
      }}
      aria-labelledby="join-title"
      className="sticker flex flex-col gap-2 p-4"
    >
      <h2 id="join-title" className="font-semibold">
        팀 코드로 합류
      </h2>
      <label className="flex flex-col gap-1 text-sm">
        팀 코드(6자리)
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          maxLength={8}
          autoCapitalize="characters"
          className="min-h-12 rounded-option border px-3 text-lg tracking-widest"
          style={field}
        />
      </label>
      <button type="submit" disabled={disabled || code.trim().length < 6} className="min-h-12 rounded-option border-2 font-semibold disabled:opacity-60" style={line}>
        합류 신청
      </button>
    </form>
  );
}

function CreateSquad({ disabled, onCreate }: { disabled: boolean; onCreate: (input: { name: string; kind: SquadKind; logo: Logo }) => Promise<void> }) {
  const [openForm, setOpenForm] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SquadKind>('friends');
  const [logo, setLogo] = useState<Logo>(DEFAULT_LOGO);
  const [touchedInitials, setTouchedInitials] = useState(false);
  const problem = name ? squadNameProblem(name) : null;
  const logoIssue = logoProblem(logo);

  if (!openForm) {
    return (
      <button type="button" onClick={() => setOpenForm(true)} className="squishy font-cute min-h-14 text-xl" style={primary}>
        새 팀 만들기
      </button>
    );
  }
  return (
    <form
      aria-labelledby="create-title"
      className="sticker flex flex-col gap-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (squadNameProblem(name) || logoIssue) return;
        void onCreate({ name, kind, logo });
      }}
    >
      <h2 id="create-title" className="font-semibold">
        새 팀 만들기
      </h2>
      <label className="flex flex-col gap-1 text-sm">
        팀 이름(2~12자)
        <input
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!touchedInitials) setLogo((current) => ({ ...current, initials: defaultInitials(event.target.value) }));
          }}
          maxLength={12}
          className="min-h-12 rounded-option border px-3"
          style={field}
        />
      </label>
      {problem && (
        <p className="text-sm" style={{ color: 'var(--out)' }}>
          {problem}
        </p>
      )}
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-semibold">팀 종류</legend>
        {SQUAD_KINDS.map((item) => (
          <label key={item.id} className="flex min-h-11 items-center gap-2 text-sm">
            <input type="radio" name="kind" checked={kind === item.id} onChange={() => setKind(item.id)} />
            <span>
              <strong>{item.name}</strong> — {item.note}
            </span>
          </label>
        ))}
        <p className="text-xs text-ink-2">종류는 나중에 바꿀 수 없어요.</p>
      </fieldset>
      <LogoEditor
        value={logo}
        onChange={(next) => {
          if (next.initials !== logo.initials) setTouchedInitials(true);
          setLogo(next);
        }}
      />
      {logoIssue && (
        <p className="text-sm" style={{ color: 'var(--out)' }}>
          {logoIssue}
        </p>
      )}
      <p className="text-xs text-ink-2 break-keep">
        비속어·남을 사칭하는 이름·실제 구단 이름은 쓸 수 없어요. 운영자가 맞지 않는 이름을 가릴 수 있어요.
      </p>
      <button type="submit" disabled={disabled || !name || !!squadNameProblem(name) || !!logoIssue} className="squishy font-cute min-h-14 text-xl disabled:opacity-60" style={primary}>
        팀 만들기
      </button>
    </form>
  );
}

function MyTeam({
  uid,
  mine,
  busy,
  run,
}: {
  uid: string;
  mine: Extract<MySquad, { state: 'member' }>;
  busy: boolean;
  run: (action: () => Promise<unknown>, done: string | null, fallback?: string) => Promise<void>;
}) {
  const { squad, members, requests } = mine;
  const captain = squad.captain === uid;
  const staff = captain || squad.coach === uid;
  const [editing, setEditing] = useState(false);
  const [week, setWeek] = useState<WeekContribution | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const link = squadLink(squad.code);
  const thisWeek = weekStartOf(kstDate(Date.now() - 86_400_000));

  useEffect(() => {
    loadWeekContribution(squad.code, thisWeek)
      .then(setWeek)
      .catch(() => setWeek(null));
  }, [squad.code, thisWeek]);

  const roleOf = (memberUid: string) => (memberUid === squad.captain ? '감독' : memberUid === squad.coach ? '코치' : null);

  return (
    <>
      <section aria-labelledby="squad-name" className="sticker flex flex-col items-center gap-2 p-4 text-center">
        <SquadLogo logo={squad.logo} size={112} badge={squad.badge} label={`${squad.name} 로고`} />
        <h2 id="squad-name" className="font-cute text-3xl">
          {squad.name}
        </h2>
        <p className="text-sm text-ink-2">
          {squadKindName(squad.kind)} · {squad.size}/{SQUAD_MAX}명 · 팀 코드 <span className="font-cute tracking-widest">{squad.code}</span>
        </p>
        {squad.badge && <p className="text-sm">지난주 팀 리그 {squad.badge}위 배지 ⭐</p>}
        <button
          type="button"
          disabled={squad.size >= SQUAD_MAX}
          onClick={() =>
            void shareOrCopy(`야구왕 「${squad.name}」 팀에 들어와! 팀 코드 ${squad.code}\n${link}`).then((outcome) =>
              outcome === 'copied' ? run(async () => {}, '팀 초대 글을 복사했어요. 카톡·문자에 붙여 넣어 주세요.') : undefined,
            )
          }
          className="squishy font-cute min-h-14 w-full text-xl disabled:opacity-60"
          style={primary}
        >
          팀원 부르기
        </button>
        <button type="button" onClick={() => void copyText(link).then((ok) => run(async () => {}, ok ? '팀 링크를 복사했어요.' : '복사하지 못했어요.'))} className="min-h-11 text-sm underline">
          팀 링크 복사
        </button>
      </section>

      <section aria-labelledby="week-title" className="flex flex-col gap-2">
        <h2 id="week-title" className="font-semibold">
          이번 주 팀 리그
        </h2>
        {week ? (
          <>
            <p className="text-sm">
              팀 점수 {week.score}점{week.rank ? ` · ${week.rank}위` : ' · 아직 순위 없음'}
              <span className="text-ink-2"> (어제까지, 매일 0시에 갱신)</span>
            </p>
            <ul className="flex flex-col gap-1" aria-label="팀원 이번 주 공식전 점수">
              {week.members.map((row, index) => (
                <li key={`${row.nickname}-${index}`} className="flex justify-between gap-2 text-sm">
                  <span>{row.nickname}</span>
                  <span className="text-ink-2">
                    {row.points}점 · {row.days}일
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-ink-2 break-keep">팀원이 오늘의 공식전을 풀면 다음 날 0시에 점수가 쌓여요.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link to="/official" className="flex min-h-11 items-center rounded-option border-2 px-3 text-sm font-semibold" style={line}>
            오늘의 공식전 풀기
          </Link>
          <Link to="/team/league" className="flex min-h-11 items-center rounded-option border-2 px-3 text-sm font-semibold" style={line}>
            팀 리그 순위
          </Link>
          <Link to="/room?team=1" className="flex min-h-11 items-center rounded-option border-2 px-3 text-sm font-semibold" style={line}>
            팀 대항전 방 만들기
          </Link>
        </div>
      </section>

      {staff && requests.length > 0 && (
        <section aria-labelledby="requests-title" className="flex flex-col gap-2">
          <h2 id="requests-title" className="font-semibold">
            합류 신청 {requests.length}명
          </h2>
          <ul className="flex flex-col gap-2">
            {requests.map((request) => (
              <li key={request.uid} className="sticker flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-semibold">
                  {request.nickname}
                  {request.child && <span className="text-ink-2"> (보호자 동의 계정)</span>}
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || squad.size >= SQUAD_MAX}
                    onClick={() => void run(() => approveRequest(squad, request), `${request.nickname} 님이 팀원이 됐어요.`)}
                    className="min-h-11 rounded-option px-3 font-semibold disabled:opacity-60"
                    style={primary}
                  >
                    승인
                  </button>
                  <button type="button" disabled={busy} onClick={() => void run(() => rejectRequest(squad.code, request.uid), '신청을 거절했어요.')} className="min-h-11 px-2 underline">
                    거절
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="members-title" className="flex flex-col gap-2">
        <h2 id="members-title" className="font-semibold">
          팀원
        </h2>
        <ul className="flex flex-col gap-2" aria-label="팀원 목록">
          {members.map((member) => (
            <li key={member.uid} className="sticker flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-semibold">
                {member.nickname}
                {roleOf(member.uid) && <span className="ml-1 rounded-full px-2 py-0.5 text-xs" style={primary}>{roleOf(member.uid)}</span>}
                {member.uid === uid && <span className="text-ink-2"> (나)</span>}
              </span>
              {captain && member.uid !== uid && (
                <span className="flex flex-wrap gap-2">
                  {!member.child && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => editSquad(squad.code, { coach: squad.coach === member.uid ? null : member.uid }), squad.coach === member.uid ? '코치를 비웠어요.' : `${member.nickname} 님을 코치로 정했어요.`)}
                      className="min-h-11 px-2 underline"
                    >
                      {squad.coach === member.uid ? '코치 빼기' : '코치로'}
                    </button>
                  )}
                  {!member.child && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => editSquad(squad.code, { captain: member.uid, coach: squad.coach === member.uid ? null : squad.coach }),
                          `${member.nickname} 님에게 감독을 넘겼어요.`,
                        )
                      }
                      className="min-h-11 px-2 underline"
                    >
                      감독 넘기기
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => kickMember(squad, member.uid), `${member.nickname} 님을 내보냈어요.`)}
                    className="min-h-11 px-2 underline"
                    style={{ color: 'var(--out)' }}
                  >
                    내보내기
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-2 break-keep">팀원에게는 닉네임과 이번 주 공식전 점수만 보여요. 메일·가입일은 보이지 않아요.</p>
      </section>

      {captain && (
        <section className="flex flex-col gap-2">
          {!editing ? (
            <button type="button" onClick={() => setEditing(true)} className="min-h-12 rounded-option border-2 font-semibold" style={line}>
              팀 이름·로고 바꾸기
            </button>
          ) : (
            <EditSquad
              squad={squad}
              busy={busy}
              onSave={(change) => run(() => editSquad(squad.code, change), '팀을 바꿨어요.').then(() => setEditing(false))}
              onCancel={() => setEditing(false)}
            />
          )}
        </section>
      )}

      {!confirmLeave ? (
        <button type="button" onClick={() => setConfirmLeave(true)} className="min-h-11 self-start text-sm underline" style={{ color: 'var(--out)' }}>
          팀 나가기
        </button>
      ) : (
        <section className="sticker flex flex-col gap-2 p-4 text-sm break-keep" role="alertdialog" aria-label="팀 나가기 확인">
          <p>
            나가면 {SQUAD_REJOIN_DAYS}일 동안 다른 팀에 들어갈 수 없어요.
            {captain && members.length > 1 && ' 감독은 가장 먼저 들어온 팀원에게 넘어가요.'}
            {members.length <= 1 && ' 혼자 남은 팀이라 팀이 없어져요.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => leaveSquad(uid, squad, members), '팀에서 나왔어요.')}
              className="min-h-11 rounded-option border-2 px-3 font-semibold"
              style={{ borderColor: 'var(--out)', color: 'var(--out)' }}
            >
              나가기
            </button>
            <button type="button" onClick={() => setConfirmLeave(false)} className="min-h-11 px-3 underline">
              그대로 있기
            </button>
          </div>
        </section>
      )}
    </>
  );
}

function EditSquad({
  squad,
  busy,
  onSave,
  onCancel,
}: {
  squad: SquadView;
  busy: boolean;
  onSave: (change: { name: string; logo: Logo }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(squad.hidden ? '' : squad.name);
  const [logo, setLogo] = useState<Logo>(squad.logo);
  const problem = name ? squadNameProblem(name) : '팀 이름을 적어 주세요.';
  const logoIssue = logoProblem(logo);
  return (
    <form
      className="sticker flex flex-col gap-3 p-4"
      aria-label="팀 이름·로고 바꾸기"
      onSubmit={(event) => {
        event.preventDefault();
        if (!problem && !logoIssue) void onSave({ name, logo });
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        팀 이름(2~12자)
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={12} className="min-h-12 rounded-option border px-3" style={field} />
      </label>
      {problem && name && (
        <p className="text-sm" style={{ color: 'var(--out)' }}>
          {problem}
        </p>
      )}
      <LogoEditor value={logo} onChange={setLogo} />
      {logoIssue && (
        <p className="text-sm" style={{ color: 'var(--out)' }}>
          {logoIssue}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !!problem || !!logoIssue} className="squishy font-cute min-h-12 flex-1 text-lg disabled:opacity-60" style={primary}>
          저장
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 px-3 underline">
          그만두기
        </button>
      </div>
    </form>
  );
}
