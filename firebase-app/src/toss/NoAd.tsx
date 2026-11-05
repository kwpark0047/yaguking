import type { AdSlotName } from '@/lib/ads/ads';

/** 미니앱판에는 자체 광고가 없다 — 앱인토스 광고(전면·보상·배너)만 허용된다(docs/toss-miniapp.md) */
export function AdSlot(_props: { slot: AdSlotName; className?: string }) {
  return null;
}
