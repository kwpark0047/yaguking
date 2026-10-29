/**
 * 자체·협찬 광고(docs/ads-plan.md) — 순수 계산. 화면은 AdSlot(앱)·AdsPage(관리자), 저장은 admin/data.ts.
 *
 * - 원본: adminConfig/ads(관리자만). 앱이 읽는 것: 공개 묶음 public/home의 `ads`(이미지 제외 — 이미 앱 열기마다 1번 읽는 문서)
 * - 이미지: public/ad_{ID} 문서 하나(줄인 WebP data URL, 120 KB 안팎). Firebase Storage는 Blaze가 필요해 쓰지 않는다
 * - 외부 광고 네트워크·추적 없음, 다른 사이트 이미지 주소 없음, "광고"·광고주 표시
 */
export type AdSlotName = 'home-top' | 'play-bottom';

export const AD_SLOTS: Record<AdSlotName, { label: string; width: number; height: number }> = {
  'home-top': { label: '메인 상단', width: 1200, height: 300 },
  'play-bottom': { label: '게임 중 하단', width: 960, height: 160 },
};

export const AD_LIMITS = {
  title: 30,
  text: 60,
  cta: 12,
  advertiser: 30,
  alt: 80,
  weight: 10,
  /** 원본 광고 수 */
  total: 30,
  /** 공개 묶음에 넣는 광고 수(게시 중 + 예약) */
  publicMax: 10,
  /** 이미지 data URL 글자 수 — 120 KB 이미지가 base64로 약 160,000자. 보안 규칙과 같다 */
  imageChars: 160_000,
  /** 게시 중 광고 이미지가 이보다 많으면 관리자 화면이 경고(무료 전송량) */
  liveImages: 3,
} as const;

export interface AdImage {
  w: number;
  h: number;
  /** 판 번호 — 이미지를 바꾸면 올라간다(앱의 기억을 새로) */
  v: number;
}

export interface PublicAd {
  id: string;
  slot: AdSlotName;
  title: string;
  text: string;
  cta: string;
  /** https 주소 또는 앱 안 주소(/ranking 등) */
  link: string;
  advertiser: string;
  startsAt: number;
  endsAt: number;
  weight: number;
  alt: string;
  image: AdImage | null;
}

export interface Ad extends PublicAd {
  hidden: boolean;
}

/** 이동 주소 종류 — 앱 안(/로 시작, //는 아님) 또는 https 바깥 주소. 그 밖(javascript: 등)은 null */
export function linkKind(link: string): 'internal' | 'external' | null {
  if (/^\/(?!\/)[^\s]*$/.test(link)) return 'internal';
  if (/^https:\/\/[^\s/]+[^\s]*$/.test(link)) return 'external';
  return null;
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** 광고 칸 문제(없으면 null) */
export function adProblem(ad: Partial<Ad>): string | null {
  if (!ad.slot || !(ad.slot in AD_SLOTS)) return '위치를 골라 주세요';
  if (!text(ad.title) || text(ad.title).length > AD_LIMITS.title) return `제목은 1~${AD_LIMITS.title}자`;
  if (text(ad.text).length > AD_LIMITS.text) return `문구는 ${AD_LIMITS.text}자까지`;
  if (!text(ad.cta) || text(ad.cta).length > AD_LIMITS.cta) return `단추 글자는 1~${AD_LIMITS.cta}자`;
  if (typeof ad.link !== 'string' || !linkKind(ad.link)) return '이동 주소는 https://… 또는 앱 안 주소(/로 시작)';
  if (!text(ad.advertiser) || text(ad.advertiser).length > AD_LIMITS.advertiser) return `광고주는 1~${AD_LIMITS.advertiser}자`;
  if (typeof ad.startsAt !== 'number' || typeof ad.endsAt !== 'number' || !(ad.endsAt > ad.startsAt)) return '끝 시각은 시작보다 뒤여야 해요';
  if (!Number.isInteger(ad.weight) || ad.weight! < 1 || ad.weight! > AD_LIMITS.weight) return `가중치는 1~${AD_LIMITS.weight}`;
  if (ad.image && (!text(ad.alt) || text(ad.alt).length > AD_LIMITS.alt)) return `이미지 대체 글은 1~${AD_LIMITS.alt}자`;
  return null;
}

export type AdStatus = 'live' | 'scheduled' | 'ended' | 'hidden';
export function adStatus(ad: Ad, now: number): AdStatus {
  if (ad.hidden) return 'hidden';
  if (ad.endsAt <= now) return 'ended';
  return ad.startsAt > now ? 'scheduled' : 'live';
}
export const AD_STATUS_LABEL: Record<AdStatus, string> = { live: '게시 중', scheduled: '예약', ended: '끝남', hidden: '숨김' };

/** 공개 묶음에 넣을 광고 — 숨김·끝남 빼고, 시작 순, publicMax개. 앱이 시작 시각을 보고 고른다(예약 광고가 저절로 열림) */
export function buildPublicAds(ads: readonly Ad[], now: number): PublicAd[] {
  return ads
    .filter((ad) => !ad.hidden && ad.endsAt > now)
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, AD_LIMITS.publicMax)
    .map(({ hidden: _hidden, ...rest }) => rest);
}

/** 지금 그 자리에 보일 수 있는 광고 */
export function liveAds<T extends PublicAd>(ads: readonly T[], slot: AdSlotName, now: number): T[] {
  return ads.filter((ad) => ad.slot === slot && ad.startsAt <= now && ad.endsAt > now);
}

/** 가중치대로 하나 — 없으면 null */
export function pickAd<T extends PublicAd>(ads: readonly T[], slot: AdSlotName, now: number, random: () => number = Math.random): T | null {
  const candidates = liveAds(ads, slot, now);
  const total = candidates.reduce((sum, ad) => sum + ad.weight, 0);
  let roll = random() * total;
  for (const ad of candidates) {
    roll -= ad.weight;
    if (roll < 0) return ad;
  }
  return candidates[candidates.length - 1] ?? null;
}

export const adImageDocId = (id: string) => `ad_${id}`;

/** 게시 중 광고 중 이미지가 있는 것의 수 */
export const liveImageCount = (ads: readonly Ad[], now: number) => ads.filter((ad) => adStatus(ad, now) === 'live' && ad.image).length;
