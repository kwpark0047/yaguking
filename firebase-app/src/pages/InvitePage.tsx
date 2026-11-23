import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/auth/AuthProvider';
import {
  currentOrNextEvent,
  INVITE_ACTIVE_DAYS,
  INVITE_ACTIVE_WINDOW_DAYS,
  INVITE_LINK_WITHIN_DAYS,
  INVITE_MILESTONES,
  INVITE_MONTHLY_CAP,
  INVITE_POINTS,
  INVITE_START,
  INVITE_STATUS_LABEL,
  inviteLink,
  inviteShareText,
  invitesOpen,
  kstDate,
} from '@/lib/growth/invite';
import {
  ensureInviteCode,
  InviteLinkError,
  linkInvite,
  linkPendingInvite,
  loadInviteStatus,
  loadMyInvite,
  type InviteRow,
  type InviteSummary,
  type MyInvite,
} from '@/lib/growth/inviteApi';
import { copyText, shareOrCopy } from '@/lib/platform/share';

const primary = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };
const line = { borderColor: 'var(--line)' };
const field = { borderColor: 'var(--line)', backgroundColor: 'var(--bg-card)' };
const TITLE_NAME: Record<string, string> = Object.fromEntries(INVITE_MILESTONES.map((item) => [item.title, item.name]));
const dayText = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;

/**
 * 친구 초대(1단계) — 내 초대 코드·링크 공유, 받은 코드 넣기(가입 후 7일 안), 초대 현황과 보너스 포인트.
 * 보상은 운영자 PC 0시 작업이 활동을 확인한 뒤 준다(ops/invite.mjs). 회원만(비회원은 가입 안내).
 */
export function InvitePage() {
  const { user, isGuest, profile } = useAuth();
  const today = kstDate();
  const open = invitesOpen();
  const event = currentOrNextEvent(today);
  // 보호자 동의를 받은 자녀 계정은 초대 코드를 만들지 않는다(규칙도 막는다 — 보상 홍보를 아이에게 하지 않게)
  const childAccount = profile.status === 'ready' && profile.data.guardian === 'consented';
  const member = !!user && !isGuest && profile.status === 'ready' && !childAccount;
  const [mine, setMine] = useState<MyInvite | null>(null);
  const [status, setStatus] = useState<{ rows: InviteRow[]; summary: InviteSummary } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !member || !user) return;
    let alive = true;
    void (async () => {
      try {
        await linkPendingInvite(user.uid); // 링크로 들어와 가입했는데 아직 연결 안 됐으면
        const loaded = await loadMyInvite(user.uid);
        const code = await ensureInviteCode(user.uid, loaded.code);
        if (alive) setMine({ ...loaded, code });
        const value = await loadInviteStatus(user.uid);
        if (alive) setStatus(value);
      } catch {
        if (alive) setError('초대 정보를 불러오지 못했어요. 연결을 확인하고 다시 열어 주세요.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, member, user]);

  const link = mine?.code ? inviteLink(location.origin, mine.code) : null;

  async function share() {
    if (!mine?.code || !link) return;
    const outcome = await shareOrCopy(inviteShareText(mine.code, link));
    setMessage(outcome === 'copied' ? '초대 글을 복사했어요. 카톡·문자에 붙여 넣어 보내 주세요.' : outcome === 'failed' ? '공유하지 못했어요. 링크 복사를 눌러 주세요.' : null);
  }

  async function copyLink() {
    if (!link) return;
    setMessage((await copyText(link)) ? '초대 링크를 복사했어요.' : '복사하지 못했어요.');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const code = await linkInvite(user.uid, input);
      setMine((current) => (current ? { ...current, invitedBy: code, canLink: false } : current));
      setMessage(`초대 코드 ${code}를 넣었어요. ${INVITE_ACTIVE_WINDOW_DAYS}일 안에 ${INVITE_ACTIVE_DAYS}일 경기하면 보너스 포인트가 들어와요.`);
      setInput('');
    } catch (caught) {
      setError(caught instanceof InviteLinkError ? caught.message : '코드를 넣지 못했어요. 다시 해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">친구 초대</h1>
      <p className="text-sm text-ink-2 break-keep">
        친구·동료·가족이 내 링크로 가입하고 {INVITE_ACTIVE_WINDOW_DAYS}일 안에 {INVITE_ACTIVE_DAYS}일 경기하면, 나는 {INVITE_POINTS.inviter}P·친구는{' '}
        {INVITE_POINTS.invitee}P 보너스 포인트를 받아요. 보너스 포인트는 힌트에 쓰고, 월간 등수에는 들어가지 않아요.
      </p>

      {event && (
        <section aria-label="초대 이벤트" className="sticker flex flex-col gap-1 p-4 break-keep">
          <p className="font-cute text-xl">{event.name}</p>
          <p className="text-sm">
            {dayText(event.start)}~{dayText(event.end)}에 활동이 확인된 초대는 포인트 {event.multiplier}배!
          </p>
        </section>
      )}

      {!open && (
        <p role="status" className="text-sm">
          친구 초대는 {dayText(INVITE_START)}부터 열려요.
        </p>
      )}

      {open && childAccount && (
        <p role="status" className="text-sm break-keep">
          보호자 동의 계정은 친구 초대를 하지 않아요. 가족팀은 팀 화면에서 팀 코드로 함께해요.
        </p>
      )}

      {open && !member && !childAccount && (
        <section className="sticker flex flex-col gap-3 p-4 break-keep">
          <p>초대는 회원만 할 수 있어요. 링크로 초대받았다면 가입할 때 코드가 자동으로 들어가요.</p>
          <Link to="/auth?mode=signup&returnTo=%2Finvite" className="flex min-h-12 items-center justify-center rounded-option font-semibold" style={primary}>
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

      {open && member && mine?.code && (
        <section aria-labelledby="my-code-title" className="sticker flex flex-col items-center gap-3 p-4 text-center">
          <h2 id="my-code-title" className="text-sm text-ink-2">
            내 초대 코드
          </h2>
          <p className="font-cute text-4xl tracking-[0.2em]" aria-label={`초대 코드 ${mine.code.split('').join(' ')}`}>
            {mine.code}
          </p>
          <button type="button" onClick={() => void share()} className="squishy font-cute min-h-14 w-full text-xl" style={primary}>
            초대하기
          </button>
          <button type="button" onClick={() => void copyLink()} className="min-h-11 text-sm underline">
            초대 링크 복사
          </button>
        </section>
      )}

      {open && member && mine?.canLink && (
        <form onSubmit={submit} aria-labelledby="enter-code-title" className="sticker flex flex-col gap-2 p-4">
          <h2 id="enter-code-title" className="font-semibold">
            받은 초대 코드 넣기
          </h2>
          <p className="text-xs text-ink-2 break-keep">가입 후 {INVITE_LINK_WITHIN_DAYS}일 안에 한 번만 넣을 수 있어요. 링크로 가입했다면 이미 들어가 있어요.</p>
          <label className="flex flex-col gap-1 text-sm">
            초대 코드(6자리)
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={8}
              autoCapitalize="characters"
              className="min-h-12 rounded-option border px-3 text-lg tracking-widest"
              style={field}
            />
          </label>
          <button type="submit" disabled={busy || input.trim().length < 6} className="min-h-12 rounded-option border-2 font-semibold disabled:opacity-60" style={line}>
            넣기
          </button>
        </form>
      )}

      {open && member && mine?.invitedBy && (
        <p className="text-sm text-ink-2">초대받은 코드 {mine.invitedBy}가 연결돼 있어요.</p>
      )}

      {open && member && status && (
        <section aria-labelledby="status-title" className="flex flex-col gap-2">
          <h2 id="status-title" className="font-semibold">
            내 초대 현황
          </h2>
          <p className="text-sm">
            보상받은 친구 {status.summary.rewarded}명 · 받은 보너스 {status.summary.bonus}P
            {status.summary.titles.length > 0 && ` · 칭호 ${status.summary.titles.map((title) => TITLE_NAME[title] ?? title).join('·')}`}
          </p>
          {status.rows.length === 0 ? (
            <p className="text-sm text-ink-2">아직 초대로 가입한 친구가 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="초대한 친구">
              {status.rows.map((row, index) => (
                <li key={`${row.nickname}-${index}`} className="sticker flex items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-semibold">{row.nickname}</span>
                  <span className="text-ink-2">
                    {INVITE_STATUS_LABEL[row.status]}
                    {row.status === 'rewarded' && ` · +${row.inviterPoints}P`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-2 break-keep">
            활동 확인과 포인트 지급은 매일 0시에 해요. 한 달에 {INVITE_MONTHLY_CAP}명까지 보상받고, 보상받은 친구가{' '}
            {INVITE_MILESTONES.map((item) => `${item.count}명이면 칭호 ‘${item.name}’(+${item.points}P)`).join(', ')}이에요. 보너스 포인트는 현금·상품으로 바꿀 수 없어요.
          </p>
        </section>
      )}
    </main>
  );
}
