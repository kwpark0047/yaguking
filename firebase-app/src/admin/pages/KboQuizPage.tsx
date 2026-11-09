import { useCallback, useEffect, useState } from 'react';
import type { OptionLabel } from '@/content/questions';
import type { Difficulty } from '@/lib/engine';
import { DIFFICULTY_LABEL } from '@/lib/game/labels';
import { KBO_MAX_QUESTIONS, KBO_MIN_QUESTIONS, KBO_QUIZ_START, headlineOf, isPlayable, kboQuestionProblem, nextSetId, previousSetId, type KboKey, type KboQuestion, type KboSet, type KboSetKind } from '@/lib/kbo/set';
import {
  listSets,
  loadGames,
  loadKeys,
  loadQuestionCount,
  loadRuns,
  loadStats,
  saveQuestionCount,
  saveSet,
  setState,
  setWithdrawn,
  type KboGameRow,
  type KboRun,
  type KboStats,
} from '../kbo';
import { ErrorText, PageTitle, field, fmtTime, line, primary } from '../ui';

const STATE_LABEL = { draft: '초안', approved: '승인', held: '보류' } as const;
const KIND_LABEL: Record<KboSetKind, string> = { quiz: '경기 퀴즈', review: '시즌 돌아보기', news: '소식 퀴즈', 'no-game': '경기 없음', rainout: '우천 취소', 'season-end': '시즌 끝' };
const STATUS_LABEL: Record<string, string> = {
  ok: '문항 생성',
  'fetch-failed': '받기 실패',
  'no-usable-games': '쓸 경기 없음',
  'waiting-final': '확정 대기',
  'no-questions': '문항 없음',
  'already-approved': '승인된 묶음 유지',
  corrected: '정정으로 철회',
  'no-game': '경기 없음',
  rainout: '우천 취소',
  'season-end': '시즌 끝',
};
const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D'];
const button = 'min-h-11 rounded-option border-2 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60';

interface Draft {
  stem: string;
  options: string[];
  correct: OptionLabel;
  difficulty: Difficulty;
  explanation: string;
  sourceName: string;
  sourceUrl: string;
  recordAsOf: string;
}
const emptyDraft = (): Draft => ({ stem: '', options: ['', '', '', ''], correct: 'A', difficulty: 'easy', explanation: '', sourceName: '', sourceUrl: 'https://', recordAsOf: '' });
function toItem(draft: Draft): { question: KboQuestion; key: KboKey } {
  return {
    question: {
      stem: draft.stem.trim(),
      options: LABELS.map((label, index) => ({ label, text: (draft.options[index] ?? '').trim() })),
      difficulty: draft.difficulty,
      category: 'team-history',
      recordAsOf: draft.recordAsOf,
      seasonScope: `${draft.recordAsOf.slice(0, 4)} 시즌`,
    },
    key: { correct: draft.correct, explanation: draft.explanation.trim(), sourceName: draft.sourceName.trim(), sourceUrl: draft.sourceUrl.trim(), recordAsOf: draft.recordAsOf },
  };
}

/**
 * 어제의 퀴즈(저장소 맨 위 docs/daily-kbo-quiz/03-design.md §7) — 수집 상태와 실행 기록을 보고, 문항의 정답·출처를 확인해 승인한다.
 * 승인한 묶음은 공개 시각(그날 06:00)에 규칙이 연다. 경기 기록 자동 수집은 이용 권한을 확보하기 전까지 없다.
 */
export function KboQuizPage() {
  const [sets, setSets] = useState<KboSet[] | null>(null);
  const [runs, setRuns] = useState<KboRun[]>([]);
  const [count, setCount] = useState(5);
  const [selected, setSelected] = useState<KboSet | null>(null);
  const [keys, setKeys] = useState<Record<number, KboKey>>({});
  const [games, setGames] = useState<KboGameRow[]>([]);
  const [stats, setStats] = useState<KboStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newId, setNewId] = useState(() => nextSetId());
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [items, setItems] = useState<{ question: KboQuestion; key: KboKey }[]>([]);

  const refresh = useCallback(async (keep?: string) => {
    const [loaded, loadedRuns, loadedCount] = await Promise.all([listSets(), loadRuns(), loadQuestionCount()]);
    setSets(loaded);
    setRuns(loadedRuns);
    setCount(loadedCount);
    if (keep) setSelected(loaded.find((item) => item.id === keep) ?? null);
  }, []);

  useEffect(() => {
    refresh().catch(() => setError('불러오지 못했어요.'));
  }, [refresh]);

  async function open(set: KboSet) {
    setSelected(set);
    setError(null);
    setKeys({});
    setGames([]);
    setStats(null);
    try {
      const [loadedKeys, loadedGames, loadedStats] = await Promise.all([loadKeys(set.id), set.kind === 'quiz' ? loadGames(set.gamesDate) : Promise.resolve([]), loadStats(set.id)]);
      setKeys(loadedKeys);
      setGames(loadedGames);
      setStats(loadedStats);
    } catch {
      setError('묶음을 불러오지 못했어요.');
    }
  }

  async function act(action: () => Promise<void>, message: string, keep?: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setStatus(message);
      await refresh(keep);
    } catch {
      setError('저장하지 못했어요. 공개 시각이 지난 묶음은 문항을 바꿀 수 없어요.');
    } finally {
      setBusy(false);
    }
  }

  function addItem() {
    const item = toItem(draft);
    const problem = kboQuestionProblem(item.question, item.key);
    if (problem) return setError(problem);
    setError(null);
    setItems((current) => [...current, item]);
    setDraft(emptyDraft());
  }

  const answersReady = (set: KboSet) => !isPlayable(set.kind) || set.questions.every((_, index) => keys[index]);
  const setDraftField = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const usingDate = newId >= KBO_QUIZ_START;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle note={<>승인한 묶음은 그날 06:00에 열려요. 시작일은 {KBO_QUIZ_START}이에요. 경기 기록 자동 수집은 이용 권한을 확보하기 전까지 없어요.</>}>어제의 퀴즈</PageTitle>
      {error && <ErrorText>{error}</ErrorText>}
      {status && <p role="status" className="text-sm">{status}</p>}

      <section aria-label="문제 수" className="flex flex-wrap items-end gap-2 rounded-option border-2 p-3" style={line}>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          경기 퀴즈 문제 수
          <input type="number" min={KBO_MIN_QUESTIONS} max={KBO_MAX_QUESTIONS} value={count} onChange={(event) => setCount(Number(event.target.value))} className="min-h-11 w-24 rounded-option border-2 px-2" style={field} />
        </label>
        <button
          type="button"
          disabled={busy || !Number.isInteger(count) || count < KBO_MIN_QUESTIONS || count > KBO_MAX_QUESTIONS}
          className={button}
          style={line}
          onClick={() => void act(() => saveQuestionCount(count), '문제 수를 저장했어요. 다음 생성부터 써요.')}
        >
          저장
        </button>
      </section>

      <section aria-label="묶음 목록" className="flex flex-col gap-2">
        <h2 className="font-bold">묶음</h2>
        {sets === null && <p className="text-sm text-ink-2">불러오는 중…</p>}
        {sets?.length === 0 && <p className="text-sm text-ink-2">아직 묶음이 없어요.</p>}
        <ul className="flex flex-col gap-1">
          {sets?.map((set) => (
            <li key={set.id}>
              <button type="button" className={`${button} w-full text-left`} style={selected?.id === set.id ? primary : line} onClick={() => void open(set)}>
                {set.id} · {KIND_LABEL[set.kind]} · {STATE_LABEL[set.state]}
                {set.isTest ? ' · 테스트' : ''} · {set.questions.length}문항
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section aria-label={`묶음 ${selected.id}`} className="flex flex-col gap-3 rounded-option border-2 p-3" style={line}>
          <h2 className="font-bold break-keep">
            {selected.id} · {headlineOf(selected)}
          </h2>
          <p className="text-sm text-ink-2">
            공개 {fmtTime(selected.publishAt)} · {STATE_LABEL[selected.state]}
            {selected.isTest && ' · 테스트 데이터라 이용자에게 열리지 않아요'}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* 이미 승인·보류된 묶음은 버튼 글자로 상태를 알린다(꺼진 금색 버튼이 고장처럼 보이지 않게) */}
            <button type="button" disabled={busy || selected.state === 'approved' || !answersReady(selected)} className={button} style={selected.state === 'approved' ? line : primary} onClick={() => void act(() => setState(selected, 'approved'), '승인했어요.', selected.id)}>
              {selected.state === 'approved' ? '승인됨' : '승인'}
            </button>
            <button type="button" disabled={busy || selected.state === 'held'} className={button} style={line} onClick={() => void act(() => setState(selected, 'held'), '보류했어요. 이용자에게 보이지 않아요.', selected.id)}>
              {selected.state === 'held' ? '보류됨' : '보류(내리기)'}
            </button>
          </div>
          {selected.state === 'approved' && <p className="text-sm text-ink-2">이미 승인한 묶음이에요. 공개 전에 내리려면 보류를 누르세요.</p>}
          {selected.state !== 'approved' && !answersReady(selected) && <p className="text-sm text-ink-2">정답을 모두 불러와야 승인할 수 있어요.</p>}

          {games.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-bold">경기 검증</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {games.map((game) => (
                  <li key={game.gameId} className="break-keep">
                    {game.label} · {game.usable ? '통과' : `제외: ${game.problems.join(', ')}`} · {game.sourceName}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ol className="flex flex-col gap-2">
            {selected.questions.map((question, index) => {
              const key = keys[index];
              const withdrawn = selected.withdrawn.includes(index);
              return (
                <li key={index} className="flex flex-col gap-1 rounded-option border p-2 text-sm break-keep" style={line}>
                  <p className="font-semibold">
                    {index + 1}. {question.stem} <span className="font-normal text-ink-2">({DIFFICULTY_LABEL[question.difficulty]})</span>
                    {withdrawn && <span className="font-normal"> · 철회됨</span>}
                  </p>
                  <p>{question.options.map((option) => `${option.label}. ${option.text}`).join(' / ')}</p>
                  {key ? (
                    <>
                      <p>
                        정답 <strong>{key.correct}</strong> · {key.explanation}
                      </p>
                      <p className="text-ink-2">
                        출처{' '}
                        <a href={key.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
                          {key.sourceName}
                        </a>{' '}
                        · 기준일 {key.recordAsOf}
                      </p>
                    </>
                  ) : (
                    <p>정답을 불러오는 중이거나 없어요.</p>
                  )}
                  {stats?.questions[index] && (
                    <p className="text-ink-2">
                      정답률 {stats.questions[index]!.correct} / {stats.questions[index]!.answered}
                    </p>
                  )}
                  <button type="button" disabled={busy} className={`${button} self-start`} style={line} onClick={() => void act(() => setWithdrawn(selected, index, !withdrawn), withdrawn ? '철회를 되돌렸어요.' : '문항을 철회했어요.', selected.id)}>
                    {withdrawn ? '철회 되돌리기' : '문항 철회'}
                  </button>
                </li>
              );
            })}
          </ol>

          {stats && (
            <p className="text-sm break-keep" aria-label="집계">
              진입 {stats.views}(비회원 {stats.guestViews}) · 시작 {stats.starts} · 완료 {stats.completes} · 가입 단추 {stats.signupClicks} · 가입 완료 {stats.signupCompletes} · 전날도 푼 사람 {stats.returned}
            </p>
          )}
        </section>
      )}

      <section aria-label="새 묶음" className="flex flex-col gap-2 rounded-option border-2 p-3" style={line}>
        <h2 className="font-bold">새 묶음</h2>
        <p className="text-sm text-ink-2 break-keep">시즌 돌아보기는 사람이 공개 보도를 대조해 쓰고 출처를 적어요. 지금은 경기 결과 입력을 받지 않아요.</p>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          여는 날(그날 06:00)
          <input type="date" value={newId} min={KBO_QUIZ_START} onChange={(event) => setNewId(event.target.value)} className="min-h-11 rounded-option border-2 px-2" style={field} />
        </label>
        <div className="flex flex-wrap gap-2">
          {(['no-game', 'rainout', 'season-end'] as const).map((kind) => (
            <button key={kind} type="button" disabled={busy || !usingDate} className={button} style={line} onClick={() => void act(() => saveSet(newId, kind, previousSetId(newId), [], 'approved'), `${KIND_LABEL[kind]} 안내를 저장했어요.`)}>
              {KIND_LABEL[kind]} 안내
            </button>
          ))}
        </div>

        <h3 className="mt-2 text-sm font-bold">시즌 돌아보기 문항 ({items.length}개)</h3>
        <ol className="list-decimal pl-5 text-sm">
          {items.map((item) => (
            <li key={item.question.stem}>{item.question.stem}</li>
          ))}
        </ol>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          문제
          <input value={draft.stem} onChange={(event) => setDraftField('stem', event.target.value)} className="min-h-11 rounded-option border-2 px-2" style={field} />
        </label>
        {LABELS.map((label, index) => (
          <label key={label} className="flex flex-col gap-1 text-sm font-semibold">
            보기 {label}
            <input
              value={draft.options[index]}
              onChange={(event) => setDraftField('options', draft.options.map((text, position) => (position === index ? event.target.value : text)))}
              className="min-h-11 rounded-option border-2 px-2"
              style={field}
            />
          </label>
        ))}
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            정답
            <select value={draft.correct} onChange={(event) => setDraftField('correct', event.target.value as OptionLabel)} className="min-h-11 rounded-option border-2 px-2" style={field}>
              {LABELS.map((label) => (
                <option key={label}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            난이도
            <select value={draft.difficulty} onChange={(event) => setDraftField('difficulty', event.target.value as Difficulty)} className="min-h-11 rounded-option border-2 px-2" style={field}>
              {(['easy', 'normal', 'hard'] as const).map((level) => (
                <option key={level} value={level}>
                  {DIFFICULTY_LABEL[level]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            기준일
            <input type="date" value={draft.recordAsOf} onChange={(event) => setDraftField('recordAsOf', event.target.value)} className="min-h-11 rounded-option border-2 px-2" style={field} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          해설
          <input value={draft.explanation} onChange={(event) => setDraftField('explanation', event.target.value)} className="min-h-11 rounded-option border-2 px-2" style={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          출처 이름
          <input value={draft.sourceName} onChange={(event) => setDraftField('sourceName', event.target.value)} className="min-h-11 rounded-option border-2 px-2" style={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          출처 주소
          <input value={draft.sourceUrl} onChange={(event) => setDraftField('sourceUrl', event.target.value)} className="min-h-11 rounded-option border-2 px-2" style={field} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || items.length >= KBO_MAX_QUESTIONS} className={button} style={line} onClick={addItem}>
            문항 더하기
          </button>
          <button
            type="button"
            disabled={busy || items.length === 0 || !usingDate}
            className={button}
            style={primary}
            onClick={() =>
              void act(async () => {
                await saveSet(newId, 'review', '', items, 'draft');
                setItems([]);
              }, '초안으로 저장했어요. 목록에서 열어 승인해 주세요.')
            }
          >
            초안 저장
          </button>
        </div>
      </section>

      <section aria-label="실행 기록" className="flex flex-col gap-1">
        <h2 className="font-bold">실행 기록</h2>
        {runs.length === 0 && <p className="text-sm text-ink-2">아직 실행 기록이 없어요.</p>}
        <ul className="flex flex-col gap-1 text-sm">
          {runs.map((run) => (
            <li key={`${run.at}-${run.gamesDate}`} className="break-keep">
              {fmtTime(run.at)} · 경기일 {run.gamesDate} · {STATUS_LABEL[run.status] ?? run.status} · 경기 {run.games}(통과 {run.usable}) · 문항 {run.questions} · {run.source}
              {run.problems.length > 0 && <span className="text-ink-2"> · {run.problems.join(' / ')}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
