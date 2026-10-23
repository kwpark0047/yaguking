import { loadPublicQuestion } from '@/lib/db/queries/questions';
import { getDb } from '@/lib/db/sql';
import { buildBoxScore, formatRate } from '@/lib/engine';
import type { BoxScore } from '@/lib/engine';
import type { AtBatLogEntryDto, PlayStateDto, RevealDto } from '@/types/api';
import { findPendingAtBat, toPublicAtBat } from './atBatRow';
import { finishSession, loadResolvedAtBats, toEntries } from './finishSession';
import type { Owner } from './owner';
import { assertOwner, loadSession, loadSessionForUpdate } from './sessionRow';

export type PlayStateResult = PlayStateDto;

/**
 * 경기 상태 복원 (08 문서 §4.5).
 *
 * 새로고침·탭 복귀·재시도 전 확인에 쓴다. 진행 중 타석의 정답·해설은
 * 포함하지 않는다.
 */
export async function getPlayState(
  sessionId: string,
  owner: Owner,
): Promise<PlayStateResult> {
  const db = getDb();
  const session = await loadSession(db, sessionId);
  await assertOwner(db, session, owner);

  const pending = await findPendingAtBat(db, sessionId);
  const [counted] = await db<{ count: string }[]>`
    select count(*)::text as count
      from public.at_bats
     where session_id = ${sessionId}
       and result is not null
  `;

  let atBat = null;
  if (pending && session.status === 'active') {
    const question = await loadPublicQuestion(db, pending.question_id);
    const [nowRow] = await db<{ now: Date }[]>`select clock_timestamp() as now`;
    atBat = toPublicAtBat(pending, question, nowRow?.now ?? new Date());
  }

  return {
    sessionId: session.id,
    mode: session.mode,
    official: session.official,
    status: session.status,
    scoreboard: {
      inning: session.current_inning,
      outs: session.outs,
      bases: session.bases,
      runs: session.runs,
      streak: session.streak,
    },
    atBat,
    atBatsPlayed: Number(counted?.count ?? '0'),
  };
}

export interface BoxScoreResult {
  sessionId: string;
  status: string;
  runs: number;
  innings: number;
  boxScore: BoxScore;
  formatted: { avg: string; obp: string; slg: string; ops: string };
  atBats: AtBatLogEntryDto[];
}

/** 박스스코어. 공유 카드와 결과 화면이 함께 쓴다. */
export async function getBoxScore(
  sessionId: string,
  owner: Owner,
): Promise<BoxScoreResult> {
  const db = getDb();
  const session = await loadSession(db, sessionId);
  await assertOwner(db, session, owner);

  const rows = await db<
    {
      sequence: number;
      inning: number;
      result: string;
      elapsed_ms: number | null;
      is_correct: boolean | null;
      rbi: number;
      category_title: string;
      difficulty: string;
      question_id: string;
      stem: string;
      explanation: string | null;
    }[]
  >`
    select ab.sequence, ab.inning, ab.result, ab.elapsed_ms, ab.is_correct, ab.rbi,
           c.title as category_title, q.difficulty,
           q.id as question_id, q.stem, q.explanation
      from public.at_bats ab
      join public.questions q on q.id = ab.question_id
      join public.question_categories c on c.id = q.category_id
     where ab.session_id = ${sessionId}
       and ab.result is not null
     order by ab.sequence
  `;

  // 여기 담긴 타석은 모두 **종료된** 타석이므로 정답·해설을 공개해도 된다
  // (07 문서 §4). 진행 중 타석은 애초에 이 목록에 없다.
  const reveals = await loadRevealsFor(
    db,
    rows.map((r) => r.question_id),
  );

  const boxScore = buildBoxScore(
    rows.map((r) => ({ result: r.result as never, rbi: r.rbi })),
  );

  return {
    sessionId: session.id,
    status: session.status,
    runs: session.runs,
    innings: Math.max(1, session.current_inning - 1),
    boxScore,
    formatted: {
      avg: formatRate(boxScore.avg),
      obp: formatRate(boxScore.obp),
      slg: formatRate(boxScore.slg),
      ops: formatRate(boxScore.ops),
    },
    atBats: rows.map((r) => ({
      sequence: r.sequence,
      inning: r.inning,
      result: r.result as AtBatLogEntryDto['result'],
      elapsedMs: r.elapsed_ms,
      isCorrect: r.is_correct,
      category: r.category_title,
      difficulty: r.difficulty,
      stem: r.stem,
      reveal: reveals.get(r.question_id) ?? null,
    })),
  };
}

/**
 * 종료된 타석들의 정답·해설·출처를 한 번에 가져온다.
 * 문항 수만큼 쿼리를 날리지 않도록 3개 쿼리로 묶는다.
 */
async function loadRevealsFor(
  db: ReturnType<typeof getDb>,
  questionIds: string[],
): Promise<Map<string, RevealDto>> {
  const unique = [...new Set(questionIds)];
  if (unique.length === 0) return new Map();

  const [options, sources, explanations] = await Promise.all([
    db<{ question_id: string; id: string; label: string; option_text: string }[]>`
      select question_id, id, label, option_text
        from private.question_options
       where question_id in ${db(unique)}
         and is_correct
    `,
    db<
      { question_id: string; source_name: string; url: string | null; verified_at: Date }[]
    >`
      select question_id, source_name, url, verified_at
        from public.question_sources
       where question_id in ${db(unique)}
       order by verified_at desc
    `,
    db<{ id: string; explanation: string | null }[]>`
      select id, explanation from public.questions where id in ${db(unique)}
    `,
  ]);

  const explanationById = new Map(explanations.map((e) => [e.id, e.explanation]));
  const sourcesById = new Map<string, RevealDto['sources']>();
  for (const source of sources) {
    const list = sourcesById.get(source.question_id) ?? [];
    list.push({
      name: source.source_name,
      url: source.url,
      verifiedAt: source.verified_at.toISOString().split('T')[0] ?? '',
    });
    sourcesById.set(source.question_id, list);
  }

  const result = new Map<string, RevealDto>();
  for (const option of options) {
    result.set(option.question_id, {
      explanation: explanationById.get(option.question_id) ?? null,
      correctOption: { id: option.id, label: option.label, text: option.option_text },
      sources: sourcesById.get(option.question_id) ?? [],
    });
  }
  return result;
}

/**
 * 중도 종료. 기록은 남기되 공식 집계에 넣지 않는다 (08 문서 §4.4).
 * 미제출 타석은 그대로 두고 세션만 abandoned로 닫는다.
 */
export async function abandonSession(
  sessionId: string,
  owner: Owner,
): Promise<{ status: string; boxScore: BoxScore }> {
  const db = getDb();

  return db.begin(async (tx) => {
    const session = await loadSessionForUpdate(tx, sessionId);
    await assertOwner(tx, session, owner);

    if (session.status !== 'active') {
      const rows = await loadResolvedAtBats(tx, sessionId);
      return { status: session.status, boxScore: buildBoxScore(toEntries(rows)) };
    }

    // 중도 종료는 공식 집계 대상이 아니므로 official을 끈 상태로 확정한다.
    const outcome = await finishSession(
      tx,
      { ...session, official: false },
      'abandoned',
    );
    return { status: 'abandoned', boxScore: outcome.boxScore };
  });
}
