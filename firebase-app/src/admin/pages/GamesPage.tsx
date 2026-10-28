import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_TITLE, loadQuestions, type Question } from '@/content/questions';
import { GAME_FLAG_LABEL, gameFlags, type GameViewRow } from '@/lib/admin/views';
import { HourBars } from './DashboardPage';
import { useView, ViewBar } from '../useView';
import { gamesPerUid, logView, rebuildGames, type GamesView } from '../views';
import { PageTitle, StatCard, field, fmtTime, line } from '../ui';

type Who = 'all' | 'member' | 'guest';
const RESULT_LABEL: Record<string, string> = { HR: '홈런', '3B': '3루타', '2B': '2루타', '1B': '안타', BB: '볼넷', K: '삼진' };

/**
 * 오늘 경기(docs/admin-dashboard-plan.md §3) — 열 때 경기 보기 하나(읽기 1). 문항 내용은 앱에 든 문제은행으로 보여
 * 준다(읽기 0). 누가 했는지 보이므로 열 때 관리자 기록. 이상 징후는 표시만 하고 기록은 고치지 않는다.
 */
export function GamesPage() {
  const { view, busy, error, refresh } = useView<GamesView>('games', rebuildGames);
  const [bank, setBank] = useState<Map<string, Question> | null>(null);
  const [mode, setMode] = useState('all');
  const [who, setWho] = useState<Who>('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [bigOnly, setBigOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const logged = useRef(false);

  useEffect(() => {
    loadQuestions()
      .then((questions) => setBank(new Map(questions.map((question) => [question.id, question]))))
      .catch(() => setBank(new Map()));
  }, []);

  useEffect(() => {
    if (!view || logged.current) return;
    logged.current = true;
    void logView('view-games', 'games', `${view.data.rows.length}경기`).catch(() => undefined);
  }, [view]);

  const perUid = useMemo(() => gamesPerUid(view?.data.rows ?? []), [view]);
  const rows = (view?.data.rows ?? []).filter((row) => {
    if (mode !== 'all' && row.mode !== mode) return false;
    if (who !== 'all' && row.member !== (who === 'member')) return false;
    if (bigOnly && row.runs < 3) return false;
    if (flaggedOnly && gameFlags(row, perUid.get(row.uid) ?? 0).length === 0) return false;
    return true;
  });
  const summary = view?.data.summary;

  return (
    <>
      <PageTitle note="한국 시간 오늘 0시부터. 기기에서 채점한 비공식 기록입니다.">오늘 경기</PageTitle>
      <ViewBar updatedAt={view?.updatedAt ?? null} busy={busy} error={error} onRefresh={() => void refresh()} cost="오늘 경기를 최대 500개 읽습니다" />
      {view === undefined && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {view && summary && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="경기" value={summary.games} hint={`연습 ${summary.practice} · 레벨 테스트 ${summary.levelTests}`} />
            <StatCard label="플레이어" value={summary.players} hint={`회원 경기 ${summary.memberGames} · 비회원 ${summary.guestGames}`} />
            <StatCard label="평균 득점" value={summary.averageRuns} hint={`평균 타석 ${summary.averagePa}`} />
            <StatCard label="정답률" value={`${Math.round(summary.correctRate * 100)}%`} hint={`홈런 비율 ${Math.round(summary.homeRunRate * 100)}% · 이상 징후 ${summary.flagged}`} />
          </div>
          {view.data.capped && <p className="text-xs text-ink-2">오늘 경기가 많아 최근 {view.data.scanned}개만 셌어요(요약은 표본).</p>}
          <div className="sticker p-4">
            <HourBars hourly={summary.hourly} />
          </div>

          {view.data.hardest.length > 0 && (
            <section aria-labelledby="hard-title" className="flex flex-col gap-2">
              <h2 id="hard-title" className="font-semibold">
                오늘 많이 틀린 문항
              </h2>
              <ol className="flex flex-col gap-1 text-sm">
                {view.data.hardest.map((item) => {
                  const question = bank?.get(item.questionId);
                  return (
                    <li key={item.questionId}>
                      <span className="num-tabular font-semibold">{Math.round(item.rate * 100)}%</span> ({item.shown}번) ·{' '}
                      {question ? `${CATEGORY_TITLE[question.category]} · ${question.stem}` : item.questionId}
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <section aria-labelledby="list-title" className="flex flex-col gap-2">
            <h2 id="list-title" className="font-semibold">
              최근 경기 {view.data.rows.length}개
            </h2>
            <div className="flex flex-wrap items-end gap-2 text-sm">
              <label className="flex flex-col gap-1">
                모드
                <select value={mode} onChange={(event) => setMode(event.target.value)} className="min-h-11 rounded-option border px-2" style={field}>
                  <option value="all">전체</option>
                  <option value="practice">개인 경기</option>
                  <option value="levelTest">레벨 테스트</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                누가
                <select value={who} onChange={(event) => setWho(event.target.value as Who)} className="min-h-11 rounded-option border px-2" style={field}>
                  <option value="all">전체</option>
                  <option value="member">회원</option>
                  <option value="guest">비회원</option>
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={bigOnly} onChange={(event) => setBigOnly(event.target.checked)} />
                3득점 이상
              </label>
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={flaggedOnly} onChange={(event) => setFlaggedOnly(event.target.checked)} />
                이상 징후만
              </label>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-ink-2">해당하는 경기가 없어요.</p>
            ) : (
              <ul className="flex flex-col gap-2" aria-label="경기 목록">
                {rows.map((row) => (
                  <GameLine key={`${row.uid}/${row.id}`} row={row} flags={gameFlags(row, perUid.get(row.uid) ?? 0)} open={open === row.id} onToggle={() => setOpen(open === row.id ? null : row.id)} bank={bank} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

function GameLine({
  row,
  flags,
  open,
  onToggle,
  bank,
}: {
  row: GameViewRow;
  flags: ReturnType<typeof gameFlags>;
  open: boolean;
  onToggle: () => void;
  bank: Map<string, Question> | null;
}) {
  const correct = row.atBats.filter((atBat) => atBat.correct).length;
  const who = row.member ? (row.nickname ?? `회원 ${row.uid.slice(0, 6)}`) : `비회원 ${row.uid.slice(0, 6)}`;
  return (
    <li className="sticker flex flex-col gap-2 p-3 text-sm">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-left">
        <span className="num-tabular">
          {fmtTime(row.createdAt).slice(11)} · {who} · {row.mode === 'levelTest' ? '레벨 테스트' : '개인 경기'} · {row.runs}득점 · 정답 {correct}/{row.pa}
        </span>
        <span className="flex flex-wrap gap-1">
          {flags.map((flag) => (
            <span key={flag} className="rounded-full border-2 px-2 py-0.5 text-xs" style={{ borderColor: 'var(--out)' }}>
              {GAME_FLAG_LABEL[flag]}
            </span>
          ))}
        </span>
      </button>
      {open && (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="타석별 기록">
          <table className="w-full min-w-[32rem] border-collapse text-left">
            <thead>
              <tr>
                {['타석', '문항', '고른 답', '응답', '결과'].map((head) => (
                  <th key={head} scope="col" className="border-b-2 px-2 py-1 text-xs" style={line}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row.atBats.map((atBat, index) => {
                const question = bank?.get(atBat.questionId);
                return (
                  <tr key={index}>
                    <td className="num-tabular border-b px-2 py-1" style={line}>{index + 1}</td>
                    <th scope="row" className="border-b px-2 py-1 font-normal" style={line}>
                      {question ? `${CATEGORY_TITLE[question.category]} · ${question.stem}` : atBat.questionId}
                    </th>
                    <td className="border-b px-2 py-1" style={line}>
                      {atBat.choice ?? '시간 초과'} {atBat.correct ? '(정답)' : question ? `(정답 ${question.correct})` : '(오답)'}
                    </td>
                    <td className="num-tabular border-b px-2 py-1" style={line}>{(atBat.elapsedMs / 1000).toFixed(1)}초</td>
                    <td className="border-b px-2 py-1" style={line}>
                      {RESULT_LABEL[atBat.result] ?? atBat.result}
                      {atBat.rbi ? ` · ${atBat.rbi}타점` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}
