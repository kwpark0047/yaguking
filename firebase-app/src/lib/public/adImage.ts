import { countReads } from '@/lib/firebase/meter';
import { adImageDocId } from '@/lib/ads/ads';
import { decode, publicDocumentUrl, type RestValue } from './home';

/**
 * 광고 이미지(public/ad_{ID}) 읽기 — 보이는 광고의 이미지만, Firestore SDK 없이 REST로(읽기 1).
 * 앱을 연 동안 판 번호(v)별로 기억한다. 기기 저장소에는 남기지 않는다.
 */
const memory = new Map<string, Promise<string | null>>();

export function loadAdImage(id: string, version: number): Promise<string | null> {
  const key = `${id}@${version}`;
  const hit = memory.get(key);
  if (hit) return hit;
  const pending = fetch(publicDocumentUrl(adImageDocId(id)))
    .then(async (response) => {
      countReads('adImage', 1);
      if (!response.ok) return null;
      const fields = ((await response.json()) as { fields?: Record<string, RestValue> }).fields ?? {};
      const data = decode(fields.data);
      return typeof data === 'string' && /^data:image\/(webp|jpeg);base64,/.test(data) ? data : null;
    })
    .catch(() => null);
  memory.set(key, pending);
  return pending;
}
