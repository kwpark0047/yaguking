import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { NEWS_CATEGORIES, NEWS_LIMITS, newsProblem, type NewsCategory, type NewsPost } from '@/lib/news/validate';
import { loadNewsConfig, saveNewsPosts, type NewsConfig } from '../data';
import { ErrorText, PageTitle, field, fmtTime, line, primary } from '../ui';

type Post = NewsPost & { hidden: boolean };
const todayKst = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const emptyDraft = (): Post => ({
  id: '',
  title: '',
  date: todayKst(),
  category: '업데이트',
  summary: '',
  body: '',
  sourceName: '',
  sourceUrl: 'https://',
  hidden: false,
});
const newId = () => `n${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/**
 * 최신 소식(docs/news.md) — 야구왕 서비스 소식(업데이트·안내·이벤트)을 쓴다. 열 때 문서 하나(읽기 1).
 * 글마다 **출처(이름·https 주소)와 날짜**가 있어야 한다. 매일 새벽 운영자 PC가 글마다 출처가 열리는지·날짜가 맞는지 다시 확인해
 * 통과한 글만 이용자 앱에 올린다(미래 날짜는 그날 올라가는 예약). 리그 경기 소식은 데이터 이용 허락 전까지 쓰지 않는다.
 */
export function NewsPage() {
  const [config, setConfig] = useState<NewsConfig | null>(null);
  const [draft, setDraft] = useState<Post>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    loadNewsConfig()
      .then(setConfig)
      .catch(() => setError('소식을 불러오지 못했어요.'));
  }, []);
  useEffect(refresh, [refresh]);

  const posts = config?.posts ?? [];
  const set = <K extends keyof Post>(key: K, value: Post[K]) => setDraft((current) => ({ ...current, [key]: value }));

  async function save(next: Post[], action: string, target: string, message: string) {
    setBusy(true);
    setError(null);
    try {
      await saveNewsPosts(next, action, target);
      setStatus(message);
      setDraft(emptyDraft());
      refresh();
    } catch {
      setError('저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    const problem = newsProblem(draft);
    if (problem) return setError(problem);
    if (!draft.id && posts.length >= NEWS_LIMITS.posts) return setError(`글은 ${NEWS_LIMITS.posts}개까지예요. 오래된 글을 지워 주세요.`);
    const post = { ...draft, id: draft.id || newId(), title: draft.title.trim(), summary: draft.summary.trim(), body: draft.body.trim(), sourceName: draft.sourceName.trim() };
    const next = draft.id ? posts.map((item) => (item.id === draft.id ? post : item)) : [post, ...posts];
    void save(next, draft.id ? 'update-news' : 'create-news', post.id, '저장했어요. 다음 새벽 확인(출처·날짜)을 통과하면 이용자 앱에 올라가요.');
  }

  function remove(post: Post) {
    void save(posts.filter((item) => item.id !== post.id), 'delete-news', post.id, '지웠어요. 다음 새벽 확인 때 이용자 앱에서도 내려가요.');
  }

  return (
    <>
      <PageTitle note="야구왕 서비스 소식(업데이트·안내·이벤트). 글마다 출처와 날짜를 매일 새벽 다시 확인해 통과한 글만 이용자 앱에 올립니다. 문서 하나를 읽습니다.">
        최신 소식
      </PageTitle>
      {error && <ErrorText>{error}</ErrorText>}
      {status && (
        <p role="status" className="text-sm" style={{ color: 'var(--on-base)' }}>
          {status}
        </p>
      )}
      {config && <p className="text-xs text-ink-2">마지막 확인: {fmtTime(config.checkedAt)}</p>}

      <form onSubmit={submit} aria-labelledby="news-form-title" className="sticker flex flex-col gap-3 p-4">
        <h2 id="news-form-title" className="font-semibold">
          {draft.id ? '글 고치기' : '새 글'}
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          제목 ({NEWS_LIMITS.title}자까지)
          <input value={draft.title} maxLength={NEWS_LIMITS.title} onChange={(event) => set('title', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">
            날짜(이날부터 보임)
            <input type="date" value={draft.date} onChange={(event) => set('date', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            분류
            <select value={draft.category} onChange={(event) => set('category', event.target.value as NewsCategory)} className="min-h-11 rounded-option border px-3" style={field}>
              {NEWS_CATEGORIES.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          요약 (목록에 보임, {NEWS_LIMITS.summary}자까지)
          <input value={draft.summary} maxLength={NEWS_LIMITS.summary} onChange={(event) => set('summary', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          본문 (문단은 빈 줄로, {NEWS_LIMITS.body}자까지)
          <textarea value={draft.body} maxLength={NEWS_LIMITS.body} rows={5} onChange={(event) => set('body', event.target.value)} className="rounded-option border px-3 py-2" style={field} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">
            출처 이름
            <input value={draft.sourceName} maxLength={NEWS_LIMITS.sourceName} onChange={(event) => set('sourceName', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            출처 주소(https)
            <input type="url" value={draft.sourceUrl} onChange={(event) => set('sourceUrl', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.hidden} onChange={(event) => set('hidden', event.target.checked)} />
          숨김(앱에 올리지 않음)
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="min-h-11 rounded-option px-4 font-semibold disabled:opacity-50" style={primary}>
            {draft.id ? '고치기' : '저장'}
          </button>
          {draft.id && (
            <button type="button" onClick={() => setDraft(emptyDraft())} className="min-h-11 rounded-option border-2 px-4 font-semibold" style={line}>
              새 글로
            </button>
          )}
        </div>
      </form>

      <section aria-labelledby="news-list-title" className="flex flex-col gap-2">
        <h2 id="news-list-title" className="font-semibold">
          글 {posts.length}개
        </h2>
        {posts.length === 0 && <p className="text-sm text-ink-2">아직 글이 없어요.</p>}
        <ul aria-label="소식 글 목록" className="flex flex-col gap-2">
          {[...posts]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((post) => {
              const check = config?.checks[post.id];
              return (
                <li key={post.id} className="sticker flex flex-col gap-1 p-3 text-sm">
                  <span className="font-semibold break-keep">
                    [{post.category}] {post.title}
                  </span>
                  <span className="text-xs text-ink-2">
                    {post.date} · 출처 {post.sourceName}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: check?.ok ? 'var(--on-base)' : 'var(--out)' }}>
                    {check ? `${check.ok ? '앱에 올림' : '올리지 않음'} — ${check.reason}` : '아직 확인 전(다음 새벽)'}
                  </span>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => setDraft(post)} className="min-h-11 font-semibold underline">
                      고치기
                    </button>
                    <button type="button" disabled={busy} onClick={() => remove(post)} className="min-h-11 font-semibold underline" style={{ color: 'var(--out)' }}>
                      지우기
                    </button>
                  </span>
                </li>
              );
            })}
        </ul>
      </section>
    </>
  );
}
