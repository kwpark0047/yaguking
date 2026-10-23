import { loadPublicQuestion } from '@/lib/db/queries/questions';
import { getDb } from '@/lib/db/sql';
import type { StartSessionDto } from '@/types/api';
import { findPendingAtBat, toPublicAtBat } from './atBatRow';
import { findGuestSession, remainingTrials, type Owner } from './owner';
import { assertOwner, goalOf, loadSession, type PlaySessionRow } from './sessionRow';
import { startSession } from './startSession';

/**
 * 진행 중인 경기를 화면이 쓰는 DTO로 복원한다. 진행 중 타석이 없으면 null.
 */
export async function loadResumableSession(
  sessionId: string,
  owner: Owner,
): Promise<StartSessionDto | null> {
  const db = getDb();
  const session = await loadSession(db, sessionId);
  await assertOwner(db, session, owner);

  if (session.status !== 'active') return null;

  const pending = await findPendingAtBat(db, sessionId);
  if (!pending) return null;

  return buildDto(session, pending, owner);
}

/**
 * 랜딩(0탭 진입)용.
 *
 * **새로고침이 체험 횟수를 깎지 않도록** 이 소유자의 진행 중 경기를 먼저 찾는다.
 * 없을 때만 새 체험 경기를 시작한다. 체험은 하루 2이닝이므로 페이지 로드마다
 * 세션을 새로 만들면 두 번 새로고침에 소진된다.
 */
export async function getOrStartTrial(owner: Owner): Promise<StartSessionDto> {
  const db = getDb();

  const guest = owner.kind === 'guest' ? await findGuestSession(db, owner.tokenHash) : null;

  const rows = await db<PlaySessionRow[]>`
    select id, user_id, guest_session_id, mode, innings_target, pa_target,
           current_inning, outs, bases, runs, streak, official,
           day_key::text as day_key, status
      from public.play_sessions
     where status = 'active'
       and ${
         owner.kind === 'user'
           ? db`user_id = ${owner.userId}`
           : db`guest_session_id = ${guest?.id ?? null}`
       }
     order by started_at desc
     limit 1
  `;

  const active = rows[0];
  if (active) {
    const pending = await findPendingAtBat(db, active.id);
    if (pending) return buildDto(active, pending, owner, guest);
  }

  return startSession({ mode: 'trial' }, owner);
}

async function buildDto(
  session: PlaySessionRow,
  pending: Awaited<ReturnType<typeof findPendingAtBat>>,
  owner: Owner,
  guestRow?: Awaited<ReturnType<typeof findGuestSession>>,
): Promise<StartSessionDto> {
  const db = getDb();
  if (!pending) throw new Error('pending at-bat required');

  const question = await loadPublicQuestion(db, pending.question_id);
  const [nowRow] = await db<{ now: Date }[]>`select clock_timestamp() as now`;
  const goal = goalOf(session);

  const guest =
    guestRow ??
    (owner.kind === 'guest' ? await findGuestSession(db, owner.tokenHash) : null);

  return {
    sessionId: session.id,
    mode: session.mode,
    official: session.official,
    goal: {
      kind: goal.kind,
      target: goal.kind === 'innings' ? goal.innings : goal.pa,
    },
    scoreboard: {
      inning: session.current_inning,
      outs: session.outs,
      bases: session.bases,
      runs: session.runs,
      streak: session.streak,
    },
    atBat: toPublicAtBat(pending, question, nowRow?.now ?? new Date()),
    guestTrialRemaining: guest ? remainingTrials(guest) : null,
  };
}
