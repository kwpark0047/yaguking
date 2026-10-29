import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AD_SLOTS, linkKind, pickAd, type AdSlotName, type PublicAd } from '@/lib/ads/ads';
import { engagementOpen, kstDate } from '@/lib/game/attendance';
import { loadAdImage } from '@/lib/public/adImage';
import { loadPublicHome } from '@/lib/public/home';

const badge = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };

/**
 * 광고 한 칸(docs/ads-plan.md) — 메인 상단(home-top)·게임 중 하단(play-bottom). 공개 묶음(public/home, 앱 열기당 읽기 1)의 광고 중
 * 지금 게시 중인 것을 가중치대로 하나 고른다. 이미지 광고면 그 이미지만 한 번 더 읽는다. 광고가 없으면 아무것도 그리지 않는다(빈 자리 없음).
 * "광고"·광고주 표시, 바깥 주소는 새 창 + rel="sponsored noopener noreferrer", 대체 글, 움직임 없음.
 */
export function AdSlot({ slot, className = '' }: { slot: AdSlotName; className?: string }) {
  const [ad, setAd] = useState<PublicAd | null>(null);
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    // 광고를 알리는 처리방침 판(2026-11-05, src/content/privacy.ts ADS_PARAGRAPH)이 시행된 뒤부터
    if (!engagementOpen(kstDate())) return;
    let alive = true;
    void loadPublicHome().then((home) => {
      if (!alive) return;
      const picked = pickAd(home.ads, slot, Date.now());
      setAd(picked);
      if (picked?.image) void loadAdImage(picked.id, picked.image.v).then((data) => alive && setImage(data));
    });
    return () => {
      alive = false;
    };
  }, [slot]);

  if (!ad || (ad.image && !image)) return null; // 이미지 광고는 이미지가 온 뒤에(자리가 덜컹이지 않게)
  const kind = linkKind(ad.link);
  if (!kind) return null;
  const size = AD_SLOTS[slot];

  const body = image ? (
    <img src={image} alt={ad.alt} width={size.width} height={size.height} className="block h-auto w-full" style={{ aspectRatio: `${size.width} / ${size.height}` }} />
  ) : (
    <span className="flex flex-wrap items-center justify-between gap-3 px-4 pt-1 pb-3">
      <span className="flex min-w-0 flex-col">
        <span className="font-cute text-lg break-keep">{ad.title}</span>
        {ad.text && <span className="text-sm text-ink-2 break-keep">{ad.text}</span>}
      </span>
      <span className="flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold" style={badge}>
        {ad.cta}
      </span>
    </span>
  );
  const label = image ? `${ad.title} — ${ad.cta}` : undefined;

  return (
    <aside aria-label="광고" className={`sticker overflow-hidden ${className}`} data-ad-slot={slot}>
      <p className="px-3 pt-2 pb-1 text-xs text-ink-2">
        <span className="mr-1 rounded px-1.5 py-0.5 font-semibold" style={badge}>
          광고
        </span>
        {ad.advertiser}
      </p>
      {kind === 'internal' ? (
        <Link to={ad.link} aria-label={label} className="block">
          {body}
        </Link>
      ) : (
        <a href={ad.link} target="_blank" rel="sponsored noopener noreferrer" aria-label={label} className="block">
          {body}
        </a>
      )}
    </aside>
  );
}
