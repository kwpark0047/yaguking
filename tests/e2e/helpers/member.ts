import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import postgres from 'postgres';

/**
 * 회원으로 로그인하는 E2E 도우미.
 *
 * **실제 흐름 그대로** 로그인한다: /auth에서 이메일 링크를 요청하고, 로컬 Supabase가
 * 보낸 메일을 Mailpit(로컬 메일 수신함)에서 꺼내 그 링크를 연다. 콜백·만 14세 확인·
 * 비회원 기록 승계까지 앱 코드가 그대로 돈다. 예전에는 E2E가 로그인 상태를 다루지
 * 못해, 회원이 "게임 시작"을 누르면 체험으로 시작되던 결함을 놓쳤다.
 *
 * 로컬 전용이다. 계정은 `e2e-…@example.test`로 만들고 `deleteE2eMembers()`가 지운다.
 */

const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';
const E2E_EMAIL_PREFIX = 'e2e-';

/** DB·Auth·Mailpit이 모두 있어야 회원 시나리오를 돌릴 수 있다. */
export async function canLogInMembers(): Promise<boolean> {
  if (!process.env.DATABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_URL) return false;
  try {
    const response = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=1`);
    return response.ok;
  } catch {
    return false;
  }
}

export function newMemberEmail(): string {
  return `${E2E_EMAIL_PREFIX}${randomUUID()}@example.test`;
}

/** 로그인·가입 화면에서 이메일 링크를 요청한다. */
export async function requestEmailLink(
  page: Page,
  email: string,
  mode: 'login' | 'signup' = 'signup',
): Promise<void> {
  const signup = mode === 'signup';
  await page.goto(`/auth?mode=${mode}`);
  await page.getByRole('button', { name: signup ? '이메일로 가입하기' : '이메일로 로그인' }).click();
  await page.getByRole('textbox', { name: '이메일' }).fill(email);
  await page.getByRole('button', { name: signup ? '가입 링크 받기' : '로그인 링크 받기' }).click();
  await expect(page.getByText(/메일함을 확인해 주세요/)).toBeVisible({ timeout: 15_000 });
}

/** Mailpit에서 그 주소로 온 링크를 꺼낸다. 읽은 메일은 지운다. */
export async function waitForEmailLink(email: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const query = encodeURIComponent(`to:"${email}"`);
    const search = (await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`).then((response) =>
      response.json(),
    )) as { messages?: { ID: string }[] };

    const message = search.messages?.[0];
    if (message) {
      const full = (await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`).then((response) =>
        response.json(),
      )) as { HTML?: string; Text?: string };
      const body = `${full.HTML ?? ''}${full.Text ?? ''}`;
      const link = body.match(/https?:\/\/[^"\s<>]*\/verify\?[^"\s<>]*/)?.[0];
      await fetch(`${MAILPIT_URL}/api/v1/messages`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ IDs: [message.ID] }),
      });
      if (link) return link.replaceAll('&amp;', '&');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${email}로 온 로그인 메일을 찾지 못했습니다.`);
}

/** 이메일 링크로 로그인까지 한다. 끝나면 콜백이 보낸 화면에 있다. */
export async function signInByEmail(
  page: Page,
  email: string,
  mode: 'login' | 'signup' = 'signup',
): Promise<void> {
  await requestEmailLink(page, email, mode);
  const link = await waitForEmailLink(email);
  await page.goto(link);
}

function localSql() {
  const url = process.env.DATABASE_URL;
  if (!url || !/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('E2E는 로컬 DB에서만 계정을 다룬다.');
  }
  return postgres(url, { max: 1 });
}

/** 이 도우미가 만든 계정과 그 기록을 지운다. */
export async function deleteE2eMembers(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const sql = localSql();
  try {
    const pattern = `${E2E_EMAIL_PREFIX}%@example.test`;
    await sql`
      delete from public.play_sessions
       where user_id in (select id from auth.users where email like ${pattern})
    `;
    await sql`
      delete from public.profiles
       where id in (select id from auth.users where email like ${pattern})
    `;
    await sql`delete from auth.users where email like ${pattern}`;
  } finally {
    await sql.end();
  }
}

/** 그 이메일의 계정이 Auth에 남아 있는가 */
export async function memberExists(email: string): Promise<boolean> {
  const sql = localSql();
  try {
    const rows = await sql`select 1 from auth.users where email = ${email}`;
    return rows.length > 0;
  } finally {
    await sql.end();
  }
}
