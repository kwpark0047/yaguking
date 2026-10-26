import { expect, type Page } from '@playwright/test';
import questions from '../../src/content/questions.generated.json' with { type: 'json' };

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
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${encoded}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  if (response.status === 404) return null;
  const body = (await response.json()) as { fields?: Record<string, unknown> };
  return body.fields ?? {};
}

/** 컬렉션의 문서 ID 목록(관리자 읽기) */
export async function listDocs(path: string): Promise<{ id: string; fields: Record<string, unknown> }[]> {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${encoded}?pageSize=300`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  const body = (await response.json()) as { documents?: { name: string; fields?: Record<string, unknown> }[] };
  return (body.documents ?? []).map((document) => ({
    id: document.name.split('/').pop()!,
    fields: document.fields ?? {},
  }));
}

/** 관리자 권한으로 문서 필드를 고친다(복습 시각을 과거로 미는 등). 규칙을 건너뛴다. */
export async function patchDoc(path: string, fields: Record<string, unknown>): Promise<void> {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const mask = Object.keys(fields).map((key) => `updateMask.fieldPaths=${key}`).join('&');
  await fetch(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/${encoded}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

/** 새로 생긴 비회원(익명) 계정 — 이메일 없는 계정 중 before에 없던 것 */
export async function newGuestUid(before: EmulatorUser[]): Promise<string | undefined> {
  const known = new Set(before.map((user) => user.localId));
  return (await accounts()).find((user) => !user.email && !known.has(user.localId))?.localId;
}

/**
 * 비회원으로 들어간다 — 메인에는 따로 버튼이 없고, "게임 시작"(/play)이 익명 로그인을 한다.
 * 경기 화면이 뜨면 메인으로 돌아와 머리줄의 비회원 표시를 확인한다.
 */
export async function becomeGuest(page: Page): Promise<void> {
  await page.goto('/play');
  await page.getByRole('link', { name: '◀ 나가기' }).click();
  await expect(page.getByText('비회원으로 플레이 중', { exact: true })).toBeVisible({ timeout: 15_000 });
}

const correctByStem = new Map(
  (questions as { stem: string; correct: string }[]).map((question) => [question.stem, question.correct]),
);

/** 지금 떠 있는 문제를 일부러 맞히거나 틀린다(테스트도 정적 문제은행을 읽는다) */
export async function answerQuestion(page: Page, correct: boolean): Promise<void> {
  const stem = (await page.locator('#question-stem').textContent())?.trim() ?? '';
  const right = correctByStem.get(stem);
  expect(right, `문제은행에 없는 문제: ${stem}`).toBeDefined();
  const label = correct ? right! : (['A', 'B', 'C', 'D'].find((option) => option !== right) as string);
  await page
    .getByRole('group', { name: '보기' })
    .locator('button', { has: page.locator('span', { hasText: new RegExp(`^${label}$`) }) })
    .click();
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

/** 겹치지 않는 닉네임(규칙: 2~16자) */
export const uniqueNickname = (prefix = '테스터') =>
  `${prefix}${Math.floor(Math.random() * 1e8).toString(36)}`.slice(0, 16);

/**
 * 프로필 설정(3단계): 닉네임 → 최애 구단(첫 번째 = 1위) → 최애 선수(선택) → 시작하기.
 */
export async function finishOnboarding(
  page: Page,
  { nickname = uniqueNickname(), teams = ['LG 트윈스'], players = [] as string[] } = {},
): Promise<string> {
  await expect(page).toHaveURL(/\/welcome\/profile/, { timeout: 15_000 });
  await page.getByLabel(/닉네임/).fill(nickname);
  await page.getByRole('button', { name: '다음' }).click();
  for (const team of teams) await page.getByRole('button', { name: team, exact: true }).click();
  await page.getByRole('button', { name: '다음' }).click();
  for (const [index, name] of players.entries()) {
    await page.getByLabel(`최애 선수 ${index + 1}위`).fill(name);
  }
  await page.getByRole('button', { name: '시작하기' }).click();
  return nickname;
}

/**
 * 새 회원은 만 14세 확인 → 프로필 설정을 거친다(Firestore가 있을 때). 그 두 화면을
 * 통과하고, 끝나면 로그아웃 버튼이 보이는 메인에 있다.
 */
export async function passAgeCheckIfAsked(page: Page): Promise<void> {
  if (hasFirestore) {
    await expect(page).toHaveURL(/\/welcome\/age/, { timeout: 15_000 });
    await page.getByRole('button', { name: '네, 만 14세 이상이에요' }).click();
    await finishOnboarding(page);
  }
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible({ timeout: 15_000 });
}
