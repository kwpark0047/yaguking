/**
 * 게스트 토큰.
 *
 * - 쿠키 값은 `<id>.<hmac>` 형태로 서명한다. 서명이 깨지면 DB를 조회하지 않는다.
 * - 서버에는 **원문을 저장하지 않고 sha256 해시만** 보관한다 (07 문서 §3.2).
 * - Web Crypto만 사용하므로 미들웨어(edge)와 라우트 핸들러(node) 양쪽에서 돈다.
 */

export const GUEST_COOKIE_NAME = 'yk_guest';
/** 체험 세션은 길게 유지할 이유가 없다. 30일. */
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  // crypto.subtle은 BufferSource(= ArrayBuffer 기반)를 요구하므로 명시적으로 할당한다.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 서명 키가 설정되어 있는지. 프록시가 하드 실패하지 않도록 먼저 확인한다. */
export function hasGuestSecret(): boolean {
  const secret = process.env.GUEST_TOKEN_SECRET;
  return Boolean(secret && secret.length >= 32);
}

function requireSecret(): string {
  const secret = process.env.GUEST_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'GUEST_TOKEN_SECRET이 없거나 32자 미만입니다. .env.example을 참고하세요.',
    );
  }
  return secret;
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(requireSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/** 새 게스트 쿠키 값을 만든다. */
export async function createGuestCookieValue(): Promise<string> {
  const id = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const key = await importKey();
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(id));
  return `${id}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * 쿠키 값을 검증하고 토큰 id를 돌려준다. 위조·변형이면 null.
 * 비교는 crypto.subtle.verify에 맡겨 타이밍 차이를 만들지 않는다.
 */
export async function verifyGuestCookieValue(
  value: string | undefined,
): Promise<string | null> {
  if (!value) return null;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return null;

  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!id || !signature) return null;

  try {
    const key = await importKey();
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signature),
      encoder.encode(id),
    );
    return valid ? id : null;
  } catch {
    return null;
  }
}

/** DB에 저장·조회할 해시. 원문 토큰은 어디에도 기록하지 않는다. */
export async function hashGuestToken(id: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(id));
  return toHex(digest);
}
