import { getDb } from '@/lib/db/sql';
import { buildBoxScore } from '@/lib/engine';
import type { BoxScore } from '@/lib/engine';
import { ensureProfile } from '@/server/me/profile';
import { loadResolvedAtBats, toEntries } from '@/server/play/finishSession';
import { addBattingStats, getCareerBatting, type CareerBatting } from '@/server/stats/batting';
import type { ClaimGuestDto } from '@/types/api';

/**
 * 게스트 기록 승계.
 *
 * 가입 직후 한 번 호출한다. **멱등이다** — `guest_sessions`를 잠그고
 * `claimed_by`를 단 한 번만 설정하므로, 두 번 호출하거나 동시에 호출해도
 * 성적이 두 번 쌓이지 않는다 (출시 게이트 G7).
 *
 * 체험 경기는 공식 집계(XP·팬 리그) 대상이 아니지만, 가입의 대가로 약속한
 * **통산 타율에는 적립한다** (06 문서 §7.2 G1). XP는 주지 않는다.
 */
export async function claimGuestSessions(
  userId: string,
  tokenHash: string,
): Promise<ClaimGuestDto> {
  const db = getDb();

  return db.begin(async (tx) => {
    await ensureProfile(tx, userId);

    const [guest] = await tx<{ id: string; claimed_by: string | null }[]>`
      select id, claimed_by
        from public.guest_sessions
       where token_hash = ${tokenHash}
       for update
    `;

    const emptyBox = buildBoxScore([]);

    if (!guest) {
      return {
        alreadyClaimed: false,
        claimedSessions: 0,
        migrated: emptyBox,
        career: await getCareerBatting(tx, userId),
      };
    }

    if (guest.claimed_by !== null) {
      // 이미 승계된 게스트 세션. 다른 계정이 가져갔더라도 옮기지 않는다.
      return {
        alreadyClaimed: true,
        claimedSessions: 0,
        migrated: emptyBox,
        career: await getCareerBatting(tx, userId),
      };
    }

    const sessions = await tx<{ id: string; status: string }[]>`
      select id, status
        from public.play_sessions
       where guest_session_id = ${guest.id}
    `;

    await tx`
      update public.guest_sessions
         set claimed_by = ${userId},
             claimed_at = now()
       where id = ${guest.id}
    `;

    if (sessions.length === 0) {
      return {
        alreadyClaimed: false,
        claimedSessions: 0,
        migrated: emptyBox,
        career: await getCareerBatting(tx, userId),
      };
    }

    // 소유권 이전. play_owner_exactly_one 제약 때문에 둘 중 하나만 남겨야 한다.
    await tx`
      update public.play_sessions
         set user_id = ${userId},
             guest_session_id = null
       where guest_session_id = ${guest.id}
    `;

    // 끝난 경기만 통산에 적립한다. 진행 중 경기는 소유권만 넘기고
    // 종료 시점에 평소대로 반영된다.
    let migrated: BoxScore = emptyBox;
    const finished = sessions.filter((s) => s.status === 'finished');

    if (finished.length > 0) {
      const entries = [];
      for (const session of finished) {
        const rows = await loadResolvedAtBats(tx, session.id);
        entries.push(...toEntries(rows));
      }
      migrated = buildBoxScore(entries);
      await addBattingStats(tx, userId, migrated);
    }

    const career: CareerBatting | null = await getCareerBatting(tx, userId);

    return {
      alreadyClaimed: false,
      claimedSessions: sessions.length,
      migrated,
      career,
    };
  });
}
