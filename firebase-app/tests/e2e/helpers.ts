import { expect, type Page } from '@playwright/test';

/**
 * Firebase판 E2E 도우미. 모두 **로컬 에뮬레이터**에만 닿는다(demo-yaguking).
 */

export const PROJECT = 'demo-yaguking';
export const hasFirestore = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'}`;

export interface EmulatorUser {
  localId: string;
  email?: string;
}

/** Auth 에뮬레이터의 계정 목록(관리 API) */
export async function accounts(): Promise<EmulatorUser[]> {
  const response = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({ returnUserInfo: true }),
    },
  );
  const body = (await response.json()) as { userInfo?: EmulatorUser[] };
  return body.userInfo ?? [];
}

/**
 * 에뮬레이터가 응답할 때까지 기다린다. Playwright는 한 주소만 보고 "떴다"고 판단하는데,
 * Auth와 Firestore가 같은 프로세스에서 차례로 떠서 하나가 늦을 수 있다.
 */
async function waitFor(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(url);
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

export async function clearEmulators(): Promise<void> {
  await waitFor('http://127.0.0.1:9099/');
  if (hasFirestore) await waitFor(`${FIRESTORE}/`);
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  if (hasFirestore) {
    await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
      method: 'DELETE',
    });
  }
}

/** Firestore 에뮬레이터에서 문서를 읽는다(보안 규칙을 건너뛰는 관리자 읽기). 없으면 null */
export async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  if (response.status === 404) return null;
  const body = (await response.json()) as { fields?: Record<string, unknown> };
  return body.fields ?? {};
}

export const uniqueEmail = () =>
  `fb-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

export async function signUp(page: Page, email: string, password = 'yaguking-123') {
  await page.goto('/auth?mode=signup');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByLabel(/비밀번호 확인/).fill(password);
  await page.getByRole('button', { name: '이메일로 가입하기' }).click();
}

/**
 * 새 회원은 만 14세 확인 화면으로 간다(Firestore가 있을 때). 거기 머물러 있으면
 * "네"를 눌러 통과하고, 끝나면 로그아웃 버튼이 보이는 메인에 있다.
 */
export async function passAgeCheckIfAsked(page: Page): Promise<void> {
  if (hasFirestore) {
    await expect(page).toHaveURL(/\/welcome\/age/, { timeout: 15_000 });
    await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
  }
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible({ timeout: 15_000 });
}
