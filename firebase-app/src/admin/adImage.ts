import { AD_LIMITS, AD_SLOTS, type AdSlotName } from '@/lib/ads/ads';

/**
 * 광고 이미지 줄이기(docs/ads-plan.md §3) — 관리자 브라우저에서. 자리 비율로 가운데를 잘라 자리 크기로 그리고, WebP(안 되면 JPEG)로
 * data URL이 AD_LIMITS.imageChars(약 120 KB) 이하가 될 때까지 화질을 낮춘다. 원본·사진 정보(위치 등)는 남지 않는다(캔버스로 다시 그림).
 * 움직이는 그림(GIF·애니메이션 WebP)은 첫 장면만.
 */
export const AD_IMAGE_MAX_FILE = 10 * 1024 * 1024;
const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45, 0.35];

export interface ShrunkImage {
  data: string;
  w: number;
  h: number;
  /** 대략의 바이트(base64 → 원래 크기) */
  bytes: number;
}

export async function shrinkAdImage(file: Blob, slot: AdSlotName): Promise<ShrunkImage> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('PNG·JPG·WebP·GIF 이미지만 올릴 수 있어요.');
  if (file.size > AD_IMAGE_MAX_FILE) throw new Error('10 MB 이하 이미지만 올릴 수 있어요.');
  const bitmap = await createImageBitmap(file);
  const { width, height } = AD_SLOTS[slot];
  // 자리 비율로 가운데 자르기(cover)
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const sw = width / scale;
  const sh = height / scale;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('이 브라우저에서는 이미지를 줄일 수 없어요.');
  context.fillStyle = '#0b1730';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, width, height);
  bitmap.close();
  for (const quality of QUALITIES) {
    let data = canvas.toDataURL('image/webp', quality);
    if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', quality); // WebP로 못 굽는 브라우저
    if (data.length <= AD_LIMITS.imageChars) {
      return { data, w: width, h: height, bytes: Math.round(((data.length - data.indexOf(',') - 1) * 3) / 4) };
    }
  }
  throw new Error('이미지를 120 KB 이하로 줄이지 못했어요. 글자·색이 덜 복잡한 이미지를 써 주세요.');
}
