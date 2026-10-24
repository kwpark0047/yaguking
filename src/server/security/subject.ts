/**
 * 요청자 식별값 해시.
 *
 * IP 원문을 저장하지 않기 위해 HMAC을 건다. 게스트 토큰을 sha256 해시로만
 * 보관하는 것과 같은 원칙이다 (07 문서 §3.2). 개인정보 처리방침이 확정되기
 * 전에 새 식별자를 평문으로 쌓지 않는다 (11 문서 §2.1).
 *
 * 키는 게스트 토큰과 같은 `GUEST_TOKEN_SECRET`을 쓴다. 키가 바뀌면 카운터가
 * 초기화될 뿐이라 영향이 작다.
 */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

/** 원문을 돌려주지 않는다. 같은 입력이면 같은 해시다. */
export async function hashSubject(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(requireSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return toHex(signature);
}
