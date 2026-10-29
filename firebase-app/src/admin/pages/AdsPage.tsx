import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AD_LIMITS,
  AD_SLOTS,
  AD_STATUS_LABEL,
  adProblem,
  adStatus,
  liveImageCount,
  type Ad,
  type AdSlotName,
} from '@/lib/ads/ads';
import { shrinkAdImage, type ShrunkImage } from '../adImage';
import { loadAds, saveAds } from '../data';
import { ErrorText, PageTitle, field, fmtTime, fromLocalInput, line, primary, toLocalInput } from '../ui';

interface Draft {
  id: string;
  slot: AdSlotName;
  title: string;
  text: string;
  cta: string;
  link: string;
  advertiser: string;
  startsAt: string;
  endsAt: string;
  weight: number;
  alt: string;
  hidden: boolean;
  /** 이미 저장된 이미지(판) — 새로 고르지 않았으면 그대로 */
  image: Ad['image'];
  /** 이번에 고른 이미지 */
  picked: ShrunkImage | null;
  removeImage: boolean;
}

const WEEK = 7 * 86_400_000;
const emptyDraft = (): Draft => ({
  id: '',
  slot: 'home-top',
  title: '',
  text: '',
  cta: '자세히 보기',
  link: '/',
  advertiser: '야구왕',
  startsAt: toLocalInput(Date.now()),
  endsAt: toLocalInput(Date.now() + WEEK),
  weight: 1,
  alt: '',
  hidden: false,
  image: null,
  picked: null,
  removeImage: false,
});
const newId = () => `a${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

/** 앱의 광고 칸과 같은 모양의 미리보기(관리자 화면 안에서만 — 링크는 누르지 않는다) */
function Preview({ draft, slot }: { draft: Draft; slot: AdSlotName }) {
  const size = AD_SLOTS[slot];
  const image = draft.picked?.data ?? null;
  return (
    <figure className="flex flex-col gap-1">
      <figcaption className="text-xs text-ink-2">
        {size.label} 미리보기({size.width}×{size.height})
      </figcaption>
      <div className="sticker overflow-hidden" style={{ maxWidth: slot === 'home-top' ? 600 : 480 }}>
        <p className="px-3 pt-2 pb-1 text-xs text-ink-2">
          <span className="mr-1 rounded px-1.5 py-0.5 font-semibold" style={primary}>
            광고
          </span>
          {draft.advertiser || '광고주'}
        </p>
        {image ? (
          <img src={image} alt={draft.alt} className="block h-auto w-full" />
        ) : draft.image && !draft.removeImage ? (
          <p className="px-4 pb-3 text-sm text-ink-2">저장된 이미지(앱에서 보임)</p>
        ) : (
          <span className="flex flex-wrap items-center justify-between gap-3 px-4 pt-1 pb-3">
            <span className="flex flex-col">
              <span className="font-cute text-lg">{draft.title || '제목'}</span>
              {draft.text && <span className="text-sm text-ink-2">{draft.text}</span>}
            </span>
            <span className="flex min-h-11 items-center rounded-full px-4 text-sm font-semibold" style={primary}>
              {draft.cta || '단추'}
            </span>
          </span>
        )}
      </div>
    </figure>
  );
}

/**
 * 광고(docs/ads-plan.md) — 자체 광고와 계약한 협찬 광고만. 열 때 문서 하나(읽기 1).
 * 저장하면 원본(adminConfig/ads)·공개 묶음(public/home의 광고)·광고 이미지(public/ad_{ID})·관리자 기록을 한 묶음으로 고친다 — 앱에 바로 보인다.
 */
export function AdsPage() {
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const refresh = useCallback(() => {
    loadAds()
      .then(setAds)
      .catch(() => setError('광고를 불러오지 못했어요.'));
  }, []);
  useEffect(refresh, [refresh]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const list = ads ?? [];

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const picked = await shrinkAdImage(file, draft.slot);
      setDraft((current) => ({ ...current, picked, removeImage: false }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '이미지를 줄이지 못했어요.');
    }
  }

  function toAd(): Ad {
    const keepImage = draft.picked
      ? { w: draft.picked.w, h: draft.picked.h, v: (draft.image?.v ?? 0) + 1 }
      : draft.removeImage
        ? null
        : draft.image;
    return {
      id: draft.id || newId(),
      slot: draft.slot,
      title: draft.title.trim(),
      text: draft.text.trim(),
      cta: draft.cta.trim(),
      link: draft.link.trim(),
      advertiser: draft.advertiser.trim(),
      startsAt: fromLocalInput(draft.startsAt),
      endsAt: fromLocalInput(draft.endsAt),
      weight: draft.weight,
      alt: draft.alt.trim(),
      hidden: draft.hidden,
      image: keepImage,
    };
  }

  async function persist(next: Ad[], changes: Parameters<typeof saveAds>[1], message: string) {
    setBusy(true);
    setError(null);
    try {
      await saveAds(next, changes);
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
    const ad = toAd();
    const problem = adProblem(ad);
    if (problem) return setError(problem);
    if (draft.picked && draft.picked.w !== AD_SLOTS[ad.slot].width) return setError('위치를 바꿨어요. 이미지를 다시 골라 주세요.');
    if (!draft.id && list.length >= AD_LIMITS.total) return setError(`광고는 ${AD_LIMITS.total}개까지예요. 끝난 광고를 지워 주세요.`);
    const next = draft.id ? list.map((item) => (item.id === ad.id ? ad : item)) : [ad, ...list];
    void persist(
      next,
      {
        images: draft.picked ? { [ad.id]: draft.picked.data } : {},
        removedImages: draft.removeImage && draft.image ? [ad.id] : [],
        action: draft.id ? 'update-ad' : 'create-ad',
        target: ad.id,
        detail: `${AD_SLOTS[ad.slot].label} ${ad.title}`,
      },
      draft.id ? '고쳤어요. 이용자 앱에 반영됐어요.' : '올렸어요. 이용자 앱에 반영됐어요.',
    );
  }

  function edit(ad: Ad) {
    setStatus(null);
    setDraft({
      ...ad,
      startsAt: toLocalInput(ad.startsAt),
      endsAt: toLocalInput(ad.endsAt),
      picked: null,
      removeImage: false,
    });
  }

  function remove(ad: Ad) {
    void persist(
      list.filter((item) => item.id !== ad.id),
      { removedImages: ad.image ? [ad.id] : [], action: 'delete-ad', target: ad.id, detail: ad.title },
      '지웠어요. 이용자 앱에서도 내려갔어요.',
    );
  }

  const liveImages = liveImageCount(list, now);

  return (
    <>
      <PageTitle note="자체 광고와 계약한 협찬 광고만. 외부 광고 네트워크·추적 없음. 이용자 앱에 '광고'와 광고주가 함께 보입니다. 문서 하나를 읽습니다.">광고</PageTitle>
      <p className="sticker p-3 text-xs break-keep text-ink-2">
        금지: 청소년 유해(주류·담배·도박·사행성·성인), 의료·금융 과장, 실제 선수 사진·구단 로고(권리 확인 전), 다른 회원 정보. 협찬 광고는 계약·광고주 표시를 확인한 뒤 올려 주세요.
      </p>
      {liveImages > AD_LIMITS.liveImages && (
        <p role="alert" className="text-sm" style={{ color: 'var(--out)' }}>
          게시 중인 이미지 광고가 {liveImages}개예요. 무료 전송량을 아끼려면 {AD_LIMITS.liveImages}개 이하로 줄여 주세요.
        </p>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      {status && (
        <p role="status" className="text-sm" style={{ color: 'var(--on-base)' }}>
          {status}
        </p>
      )}

      <form onSubmit={submit} aria-labelledby="ad-form-title" className="sticker flex flex-col gap-3 p-4">
        <h2 id="ad-form-title" className="font-semibold">
          {draft.id ? '광고 고치기' : '새 광고'}
        </h2>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">
            위치
            <select
              value={draft.slot}
              onChange={(event) => setDraft((current) => ({ ...current, slot: event.target.value as AdSlotName, picked: null }))}
              className="min-h-11 rounded-option border px-3"
              style={field}
            >
              {(Object.keys(AD_SLOTS) as AdSlotName[]).map((slot) => (
                <option key={slot} value={slot}>
                  {AD_SLOTS[slot].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            가중치(1~{AD_LIMITS.weight})
            <input type="number" min={1} max={AD_LIMITS.weight} value={draft.weight} onChange={(event) => set('weight', Number(event.target.value))} className="min-h-11 w-24 rounded-option border px-3" style={field} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          제목 ({AD_LIMITS.title}자까지)
          <input value={draft.title} maxLength={AD_LIMITS.title} onChange={(event) => set('title', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          문구 (선택, {AD_LIMITS.text}자까지)
          <input value={draft.text} maxLength={AD_LIMITS.text} onChange={(event) => set('text', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">
            단추 글자
            <input value={draft.cta} maxLength={AD_LIMITS.cta} onChange={(event) => set('cta', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            이동 주소(https://… 또는 /ranking 같은 앱 안 주소)
            <input value={draft.link} onChange={(event) => set('link', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          광고주
          <input value={draft.advertiser} maxLength={AD_LIMITS.advertiser} onChange={(event) => set('advertiser', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm">
            시작(한국 시각)
            <input type="datetime-local" value={draft.startsAt} onChange={(event) => set('startsAt', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            끝
            <input type="datetime-local" value={draft.endsAt} onChange={(event) => set('endsAt', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
        </div>

        <fieldset className="flex flex-col gap-2 rounded-option border p-3" style={line}>
          <legend className="px-1 text-sm font-semibold">이미지(선택)</legend>
          <label className="flex flex-col gap-1 text-sm">
            이미지 고르기(PNG·JPG·WebP·GIF, 10 MB까지 — {AD_SLOTS[draft.slot].width}×{AD_SLOTS[draft.slot].height}로 잘라 120 KB 이하로 줄임)
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void pick(event.target.files?.[0])} className="text-sm" />
          </label>
          {draft.picked && <p className="text-xs" role="status">줄인 이미지 {draft.picked.w}×{draft.picked.h}, {kb(draft.picked.bytes)}</p>}
          {draft.image && !draft.picked && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.removeImage} onChange={(event) => set('removeImage', event.target.checked)} />
              저장된 이미지 지우기(글 광고로)
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            대체 글(이미지가 있으면 필수, {AD_LIMITS.alt}자까지 — 화면 읽기 프로그램이 읽음)
            <input value={draft.alt} maxLength={AD_LIMITS.alt} onChange={(event) => set('alt', event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
        </fieldset>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.hidden} onChange={(event) => set('hidden', event.target.checked)} />
          숨김(앱에 보이지 않음)
        </label>

        <Preview draft={draft} slot={draft.slot} />

        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="min-h-11 rounded-option px-4 font-semibold disabled:opacity-50" style={primary}>
            {draft.id ? '고치기' : '올리기'}
          </button>
          {draft.id && (
            <button type="button" onClick={() => setDraft(emptyDraft())} className="min-h-11 rounded-option border-2 px-4 font-semibold" style={line}>
              새 광고로
            </button>
          )}
        </div>
      </form>

      <section aria-labelledby="ad-list-title" className="flex flex-col gap-2">
        <h2 id="ad-list-title" className="font-semibold">
          광고 {list.length}개
        </h2>
        {ads?.length === 0 && <p className="text-sm text-ink-2">아직 광고가 없어요.</p>}
        <ul aria-label="광고 목록" className="flex flex-col gap-2">
          {list.map((ad) => {
            const state = adStatus(ad, now);
            return (
              <li key={ad.id} className="sticker flex flex-col gap-1 p-3 text-sm">
                <span className="font-semibold break-keep">
                  [{AD_SLOTS[ad.slot].label}] {ad.title}
                  {ad.image ? ' · 이미지' : ' · 글'}
                </span>
                <span className="text-xs text-ink-2">
                  {AD_STATUS_LABEL[state]} · {fmtTime(ad.startsAt)} ~ {fmtTime(ad.endsAt)} · 광고주 {ad.advertiser} · 가중치 {ad.weight}
                </span>
                <span className="flex gap-3">
                  <button type="button" onClick={() => edit(ad)} className="min-h-11 font-semibold underline">
                    고치기
                  </button>
                  <button type="button" disabled={busy} onClick={() => remove(ad)} className="min-h-11 font-semibold underline" style={{ color: 'var(--out)' }}>
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
