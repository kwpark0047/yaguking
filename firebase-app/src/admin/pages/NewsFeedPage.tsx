import { useCallback, useEffect, useState } from 'react';
import { TEAMS } from '@/content/teams';
import type { Difficulty } from '@/lib/engine';
import { DIFFICULTY_LABEL } from '@/lib/game/labels';
import { MAX_FEEDS, feedProblem, type NewsFeed } from '@/lib/news/feeds';
import { draftFromNews, type DraftKind } from '@/lib/news/quizDraft';
import { nextSetId, type KboKey, type KboQuestion } from '@/lib/kbo/set';
import { appendToSet, loadFeedRuns, loadFeeds, loadItems, saveFeeds, type FeedRun, type NewsItem } from '../newsFeed';
import { ErrorText, PageTitle, field, fmtTime, line, primary } from '../ui';

const button = 'min-h-11 rounded-option border-2 px-3 text-sm font-semibold';
const input = 'min-h-11 rounded-option border-2 px-2';
const STATUS_LABEL: Record<string, string> = {
  ok: '받음',
  off: '꺼짐',
  'terms-unchecked': '이용 조건 미확인',
  blocked: '등록 불가 주소',
  robots: 'robots.txt가 막음',
  'fetch-failed': '받기 실패',
};
const emptyFeed = (): NewsFeed => ({ id: '', name: '', url: 'https://', termsUrl: 'https://', termsChecked: false, enabled: true });
const newId = () => `f${Date.now().toString(36)}`;

interface Builder {
  kind: DraftKind;
  stem: string;
  correct: string;
  unit: string;
  wrong: string[];
  difficulty: Difficulty;
  explanation: string;
  setId: string;
}

/**
 * 소식 가져오기(저장소 맨 위 docs/daily-kbo-quiz/05-news-feed.md) — 이용 조건을 확인한 언론사 RSS를 운영자 PC가 하루 한 번 읽는다.
 * 가져온 소식에서 정답이 될 사실을 골라 틀로 문제 초안을 만들고, "어제의 퀴즈" 묶음에 더한다(승인은 그 화면에서).
 */
export function NewsFeedPage() {
  const [feeds, setFeeds] = useState<NewsFeed[]>([]);
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [runs, setRuns] = useState<FeedRun[]>([]);
  const [feed, setFeed] = useState<NewsFeed>(emptyFeed);
  const [picked, setPicked] = useState<NewsItem | null>(null);
  const [builder, setBuilder] = useState<Builder | null>(null);
  const [preview, setPreview] = useState<{ question: KboQuestion; key: KboKey } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [loadedFeeds, loadedItems, loadedRuns] = await Promise.all([loadFeeds(), loadItems(), loadFeedRuns()]);
    setFeeds(loadedFeeds);
    setItems(loadedItems);
    setRuns(loadedRuns);
  }, []);
  useEffect(() => {
    refresh().catch(() => setError('불러오지 못했어요.'));
  }, [refresh]);

  async function act(action: () => Promise<void>, message: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setStatus(message);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error && /[가-힣]/.test(caught.message) ? caught.message : '저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  function addFeed() {
    const next = { ...feed, id: newId(), name: feed.name.trim(), url: feed.url.trim(), termsUrl: feed.termsUrl.trim() };
    const problem = feedProblem(next);
    if (problem) return setError(problem);
    if (feeds.length >= MAX_FEEDS) return setError(`피드는 ${MAX_FEEDS}개까지예요.`);
    void act(async () => {
      await saveFeeds([...feeds, next], 'newsFeed.add', next.name);
      setFeed(emptyFeed());
    }, '피드를 더했어요. 다음 0시 작업부터 읽어요.');
  }

  function pick(item: NewsItem) {
    setPicked(item);
    setPreview(null);
    setError(null);
    setBuilder({ kind: 'team', stem: '', correct: TEAMS[0]!.name, unit: '', wrong: ['', '', ''], difficulty: 'normal', explanation: item.title, setId: nextSetId() });
  }

  function makeDraft() {
    if (!picked || !builder) return null;
    const result = draftFromNews(picked, { ...builder, seed: `${picked.id}|${builder.stem}` });
    if (result.problem) setError(result.problem);
    else setError(null);
    return result.draft;
  }

  const setB = <K extends keyof Builder>(key: K, value: Builder[K]) => setBuilder((current) => (current ? { ...current, [key]: value } : current));
  const setF = <K extends keyof NewsFeed>(key: K, value: NewsFeed[K]) => setFeed((current) => ({ ...current, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      <PageTitle note="이용 조건을 확인한 언론사 RSS만 운영자 PC가 하루 한 번(0시) 읽어요. 제목·링크·짧은 요약만 남기고 14일 뒤 지워요. KBO 공식 사이트는 약관상 등록할 수 없어요.">소식 가져오기</PageTitle>
      {error && <ErrorText>{error}</ErrorText>}
      {status && <p role="status" className="text-sm">{status}</p>}

      <section aria-label="피드" className="flex flex-col gap-2 rounded-option border-2 p-3" style={line}>
        <h2 className="font-bold">피드 ({feeds.length}개)</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {feeds.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-2 break-all">
              <span className="font-semibold">{item.name}</span>
              <span className="text-ink-2">{item.url}</span>
              <span>{item.termsChecked ? '이용 조건 확인함' : '이용 조건 미확인'}</span>
              <button
                type="button"
                disabled={busy}
                className={button}
                style={line}
                onClick={() => void act(() => saveFeeds(feeds.map((other) => (other.id === item.id ? { ...other, enabled: !other.enabled } : other)), item.enabled ? 'newsFeed.off' : 'newsFeed.on', item.name), item.enabled ? '껐어요.' : '켰어요.')}
              >
                {item.enabled ? `${item.name} 끄기` : `${item.name} 켜기`}
              </button>
              <button type="button" disabled={busy} className={button} style={line} onClick={() => void act(() => saveFeeds(feeds.filter((other) => other.id !== item.id), 'newsFeed.remove', item.name), '지웠어요.')}>
                {item.name} 지우기
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            피드 이름
            <input value={feed.name} onChange={(event) => setF('name', event.target.value)} className={input} style={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            RSS 주소
            <input value={feed.url} onChange={(event) => setF('url', event.target.value)} className={input} style={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            이용 조건 주소
            <input value={feed.termsUrl} onChange={(event) => setF('termsUrl', event.target.value)} className={input} style={field} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={feed.termsChecked} onChange={(event) => setF('termsChecked', event.target.checked)} />
            이용 조건을 읽었고, 이 서비스에서 제목·링크를 쓰고 문제를 만들어도 된다고 확인했어요
          </label>
          <button type="button" disabled={busy} className={`${button} self-start`} style={primary} onClick={addFeed}>
            피드 더하기
          </button>
        </div>
      </section>

      <section aria-label="가져온 소식" className="flex flex-col gap-2">
        <h2 className="font-bold">가져온 소식</h2>
        {items === null && <p className="text-sm text-ink-2">불러오는 중…</p>}
        {items?.length === 0 && <p className="text-sm text-ink-2">아직 없어요. 피드를 더하면 다음 0시 작업부터 모여요(운영자 PC에서 `node ops/admin-cli.mjs news-feed`로 바로 돌릴 수도 있어요).</p>}
        <ul className="flex flex-col gap-1">
          {items?.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 rounded-option border p-2 text-sm break-keep" style={line}>
              <a href={item.link} target="_blank" rel="noreferrer noopener" className="font-semibold underline">
                {item.title}
              </a>
              <span className="text-ink-2">
                {item.feedName} · {fmtTime(item.publishedAt)}
              </span>
              {item.summary && <span className="text-ink-2">{item.summary}</span>}
              <button type="button" className={`${button} self-start`} style={picked?.id === item.id ? primary : line} onClick={() => pick(item)}>
                이 소식으로 문제 만들기
              </button>
            </li>
          ))}
        </ul>
      </section>

      {picked && builder && (
        <section aria-label="문제 만들기" className="flex flex-col gap-2 rounded-option border-2 p-3" style={line}>
          <h2 className="font-bold break-keep">문제 만들기 — {picked.title}</h2>
          <p className="text-sm text-ink-2 break-keep">기사에서 정답이 될 사실을 직접 확인해 적어 주세요. 오답 보기와 순서는 틀이 채워요.</p>
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="font-semibold">정답 종류</legend>
            {(
              [
                ['team', '구단'],
                ['number', '숫자'],
                ['text', '직접(선수 등)'],
              ] as const
            ).map(([kind, label]) => (
              <label key={kind} className="flex items-center gap-1">
                <input type="radio" name="draft-kind" checked={builder.kind === kind} onChange={() => setB('kind', kind)} />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            문제
            <input value={builder.stem} onChange={(event) => setB('stem', event.target.value)} className={input} style={field} />
          </label>
          {builder.kind === 'team' && (
            <label className="flex flex-col gap-1 text-sm font-semibold">
              정답 구단
              <select value={builder.correct} onChange={(event) => setB('correct', event.target.value)} className={input} style={field}>
                {TEAMS.map((team) => (
                  <option key={team.slug}>{team.name}</option>
                ))}
              </select>
            </label>
          )}
          {builder.kind === 'number' && (
            <div className="flex flex-wrap gap-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                정답 숫자
                <input inputMode="numeric" value={builder.correct} onChange={(event) => setB('correct', event.target.value)} className={`${input} w-28`} style={field} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                단위
                <input value={builder.unit} onChange={(event) => setB('unit', event.target.value)} className={`${input} w-28`} style={field} />
              </label>
            </div>
          )}
          {builder.kind === 'text' && (
            <>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                정답
                <input value={builder.correct} onChange={(event) => setB('correct', event.target.value)} className={input} style={field} />
              </label>
              {builder.wrong.map((text, index) => (
                <label key={index} className="flex flex-col gap-1 text-sm font-semibold">
                  오답 {index + 1}
                  <input value={text} onChange={(event) => setB('wrong', builder.wrong.map((other, position) => (position === index ? event.target.value : other)))} className={input} style={field} />
                </label>
              ))}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              난이도
              <select value={builder.difficulty} onChange={(event) => setB('difficulty', event.target.value as Difficulty)} className={input} style={field}>
                {(['easy', 'normal', 'hard'] as const).map((level) => (
                  <option key={level} value={level}>
                    {DIFFICULTY_LABEL[level]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold">
              넣을 묶음(여는 날)
              <input type="date" value={builder.setId} onChange={(event) => setB('setId', event.target.value)} className={input} style={field} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            해설
            <input value={builder.explanation} onChange={(event) => setB('explanation', event.target.value)} className={input} style={field} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} style={line} onClick={() => setPreview(makeDraft())}>
              초안 보기
            </button>
            <button
              type="button"
              disabled={busy}
              className={button}
              style={primary}
              onClick={() => {
                const draft = makeDraft();
                if (!draft) return;
                setPreview(draft);
                void act(async () => {
                  await appendToSet(builder.setId, draft);
                }, `${builder.setId} 묶음에 초안으로 더했어요. "어제의 퀴즈"에서 확인하고 승인해 주세요.`);
              }}
            >
              묶음에 더하기
            </button>
          </div>
          {preview && (
            <div aria-label="초안" className="rounded-option border p-2 text-sm break-keep" style={line}>
              <p className="font-semibold">{preview.question.stem}</p>
              <p>{preview.question.options.map((option) => `${option.label}. ${option.text}`).join(' / ')}</p>
              <p>
                정답 {preview.key.correct} · 출처 {preview.key.sourceName} · 기준일 {preview.key.recordAsOf}
              </p>
            </div>
          )}
        </section>
      )}

      <section aria-label="가져오기 기록" className="flex flex-col gap-1">
        <h2 className="font-bold">가져오기 기록</h2>
        {runs.length === 0 && <p className="text-sm text-ink-2">아직 기록이 없어요.</p>}
        <ul className="flex flex-col gap-1 text-sm">
          {runs.slice(0, 10).map((run) => (
            <li key={run.at} className="break-keep">
              {fmtTime(run.at)} · 새 소식 {run.added} · 지움 {run.removed} · {run.feeds.map((item) => `${item.name}: ${STATUS_LABEL[item.status] ?? item.status}${item.reason ? `(${item.reason})` : ''}`).join(', ')}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
