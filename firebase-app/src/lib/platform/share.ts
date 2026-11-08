/**
 * 공유·링크 — 판마다 다르다. 웹판은 이 파일, 앱인토스 미니앱판은 src/toss/share.ts(vite.toss.config.ts가 바꿔 끼운다).
 * 두 파일의 내보내기는 같아야 한다.
 */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/** 다른 사람에게 보낼 이 앱의 주소 */
export function appUrl(path: string): string {
  return `${location.origin}${path}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 공유 창을 열고, 없으면 복사한다. 공유 창을 그냥 닫은 것은 실패가 아니다 */
export async function shareOrCopy(text: string): Promise<ShareOutcome> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

/** 이미지 공유를 쓰는 판인가(웹판은 공유 창이 없으면 내려받기로) */
export function canShareImage(): boolean {
  return typeof document !== 'undefined';
}

/** 이미지 한 장 공유 — 공유 창이 파일을 받으면 공유, 아니면 내려받는다 */
export async function shareImage(blob: Blob, fileName: string, text: string): Promise<ShareOutcome | 'downloaded'> {
  const file = new File([blob], fileName, { type: blob.type || 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled';
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
