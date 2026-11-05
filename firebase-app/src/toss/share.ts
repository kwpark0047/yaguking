import type { ShareOutcome } from '@/lib/platform/share';

/** apps-in-toss.config.ts의 appName과 같아야 한다 */
export const APP_NAME = 'yaguking';
const SCHEME = `intoss://${APP_NAME}`;

/**
 * 미니앱판 공유 — 앱인토스 정책: 공유 링크가 자사 웹으로 가면 안 되고 intoss:// 스킴을 쓴다.
 * SDK는 토스 앱 안에서만 동작하므로, 개발 브라우저에서는 웹 API로 넘어간다.
 */
export function appUrl(path: string): string {
  return `${SCHEME}${path}`;
}

/** 글 안의 intoss:// 주소를 토스 앱에서 열리는 공유 링크로(실패하면 그대로) */
async function withShareLink(text: string): Promise<string> {
  const match = text.match(new RegExp(`${SCHEME}[^\\s]*`));
  if (!match) return text;
  try {
    const { Share } = await import('@apps-in-toss/web-framework');
    return text.replace(match[0], await Share.createLink({ path: match[0] }));
  } catch {
    return text;
  }
}

export async function copyText(text: string): Promise<boolean> {
  const message = await withShareLink(text);
  try {
    const { setClipboardText } = await import('@apps-in-toss/web-framework');
    await setClipboardText(message);
    return true;
  } catch {
    return navigator.clipboard?.writeText(message).then(
      () => true,
      () => false,
    ) ?? false;
  }
}

export async function shareOrCopy(text: string): Promise<ShareOutcome> {
  const message = await withShareLink(text);
  try {
    const { Share } = await import('@apps-in-toss/web-framework');
    await Share.sendMessage({ message });
    return 'shared';
  } catch {
    return (await copyText(text)) ? 'copied' : 'failed';
  }
}
