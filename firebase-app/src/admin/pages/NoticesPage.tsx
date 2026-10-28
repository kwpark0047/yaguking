import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX, noticeProblem, type Notice } from '@/lib/admin/notices';
import { saveNotice, seedNoticesView } from '../data';
import { readView, type NoticesView } from '../views';
import { ErrorText, PageTitle, field, fmtTime, fromLocalInput, line, primary, toLocalInput } from '../ui';

interface Draft {
  id: string | null;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  pinned: boolean;
  hidden: boolean;
}

const emptyDraft = (): Draft => ({ id: null, title: '', body: '', startsAt: toLocalInput(Date.now()), endsAt: '', pinned: false, hidden: false });

/**
 * 공지사항 — 저장하면 원본(notices)과 이용자 앱이 읽는 공개 묶음(public/home)을 한 번에 고친다(docs/admin-plan.md §5.9).
 * 글자만(HTML 없음). 예약 공개(시작 시각), 고정, 숨김.
 */
export function NoticesPage() {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 공지 보기 하나만 읽는다(읽기 1). 아직 없으면 한 번 원본에서 만든다
  const refresh = useCallback(() => {
    readView<NoticesView>('notices')
      .then((view) => (view ? view.data.notices : seedNoticesView()))
      .then(setNotices)
      .catch(() => setError('공지를 불러오지 못했어요.'));
  }, []);
  useEffect(refresh, [refresh]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input = {
      title: draft.title,
      body: draft.body,
      startsAt: fromLocalInput(draft.startsAt),
      endsAt: draft.endsAt ? fromLocalInput(draft.endsAt) : null,
      pinned: draft.pinned,
      hidden: draft.hidden,
    };
    const problem = noticeProblem(input);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await saveNotice(draft.id, input, notices ?? []);
      setStatus(draft.id ? '고쳤어요. 이용자 앱에 반영됐어요.' : '올렸어요. 이용자 앱에 반영됐어요.');
      setDraft(emptyDraft());
      refresh();
    } catch {
      setError('저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(notice: Notice) {
    if (!window.confirm(`"${notice.title}" 공지를 지울까요?`)) return;
    try {
      await saveNotice(notice.id, null, notices ?? []);
      setStatus('지웠어요.');
      refresh();
    } catch {
      setError('지우지 못했어요.');
    }
  }

  const edit = (notice: Notice) =>
    setDraft({
      id: notice.id,
      title: notice.title,
      body: notice.body,
      startsAt: toLocalInput(notice.startsAt),
      endsAt: notice.endsAt ? toLocalInput(notice.endsAt) : '',
      pinned: notice.pinned,
      hidden: notice.hidden,
    });

  const now = Date.now();
  const stateOf = (notice: Notice) =>
    notice.hidden ? '숨김' : notice.startsAt > now ? '예약' : notice.endsAt !== null && notice.endsAt <= now ? '끝남' : '공개 중';

  return (
    <>
      <PageTitle note="저장하면 바로 이용자 앱 메인 띠와 공지 목록에 반영됩니다(시작 시각 전에는 보이지 않음). 시각은 한국 시간.">공지사항</PageTitle>
      <form onSubmit={(event) => void submit(event)} className="sticker flex flex-col gap-3 p-4" aria-label={draft.id ? '공지 고치기' : '새 공지'}>
        <h2 className="text-lg font-semibold">{draft.id ? '공지 고치기' : '새 공지'}</h2>
        <label className="flex flex-col gap-1 text-sm">
          제목 ({draft.title.trim().length}/{NOTICE_TITLE_MAX})
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={NOTICE_TITLE_MAX} className="min-h-11 rounded-option border px-3" style={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          본문 ({draft.body.length}/{NOTICE_BODY_MAX}, 글자만)
          <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} maxLength={NOTICE_BODY_MAX} rows={5} className="rounded-option border px-3 py-2" style={field} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">
            공개 시작
            <input type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            공개 끝(비우면 계속)
            <input type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={draft.pinned} onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })} />
            메인 띠에 고정
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={draft.hidden} onChange={(event) => setDraft({ ...draft, hidden: event.target.checked })} />
            숨김
          </label>
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="min-h-11 rounded-option px-4 font-semibold disabled:opacity-60" style={primary}>
            {draft.id ? '고치기' : '올리기'}
          </button>
          {draft.id && (
            <button type="button" onClick={() => setDraft(emptyDraft())} className="min-h-11 rounded-option border-2 px-4 text-sm font-semibold" style={line}>
              새 공지로
            </button>
          )}
        </div>
      </form>
      {status && (
        <p role="status" className="text-sm">
          {status}
        </p>
      )}
      <section aria-labelledby="notice-list" className="flex flex-col gap-2">
        <h2 id="notice-list" className="text-lg font-semibold">공지 목록</h2>
        {!notices && <p className="text-sm text-ink-2">불러오는 중…</p>}
        {notices?.length === 0 && <p className="text-sm text-ink-2">아직 공지가 없어요.</p>}
        <ul className="flex flex-col gap-2">
          {notices?.map((notice) => (
            <li key={notice.id} className="sticker flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="flex flex-col">
                <span className="font-semibold">
                  {notice.pinned && '📌 '}
                  {notice.title}
                </span>
                <span className="num-tabular text-ink-2">
                  {stateOf(notice)} · {fmtTime(notice.startsAt)}
                  {notice.endsAt ? ` ~ ${fmtTime(notice.endsAt)}` : ''}
                </span>
              </span>
              <span className="flex gap-2">
                <button type="button" onClick={() => edit(notice)} className="min-h-11 underline">
                  고치기
                </button>
                <button type="button" onClick={() => void remove(notice)} className="min-h-11 underline">
                  지우기
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
