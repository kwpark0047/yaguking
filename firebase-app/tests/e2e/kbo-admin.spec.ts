import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { KBO_QUIZ_START, publishAtOf } from '@/lib/kbo/set';
import { accounts, clearEmulators, hasFirestore, listDocs, patchDoc, readDoc } from './helpers';

/** 관리자 "어제의 퀴즈" — 정답·출처 확인, 승인·철회·보류, 안내와 돌아보기 묶음 만들기. 지어낸 묶음만 쓴다 */
test.skip(!hasFirestore, 'Firestore 에뮬레이터가 필요합니다');

const ADMIN = 'http://localhost:5175';
const AUTH = 'http://127.0.0.1:9099';
const DAY = '2026-12-01';
const string = (stringValue: string) => ({ stringValue });

async function seedDraft() {
  const options = { arrayValue: { values: ['가', '나', '다', '라'].map((text, index) => ({ mapValue: { fields: { label: string('ABCD'[index]!), text: string(text) } } })) } };
  await patchDoc(`kboSets/${DAY}`, {
    kind: string('quiz'),
    gamesDate: string('2026-11-30'),
    publishAt: { timestampValue: new Date(publishAtOf(DAY)).toISOString() },
    state: string('draft'),
    isTest: { booleanValue: false },
    withdrawn: { arrayValue: { values: [] } },
    questions: { arrayValue: { values: [{ mapValue: { fields: { stem: string('검토할 테스트 문제는?'), options, difficulty: string('easy'), category: string('team-history'), recordAsOf: string('2026-11-30'), seasonScope: string('2026 시즌') } } }] } },
    updatedAt: { timestampValue: new Date().toISOString() },
    by: string('ops:fixture'),
  });
  await patchDoc(`kboSets/${DAY}/keys/0`, { correct: string('C'), explanation: string('검토용 해설'), sourceName: string('검토용 출처'), sourceUrl: string('https://example.test/review'), recordAsOf: string('2026-11-30') });
}

// 개발 서버를 막 띄운 첫 실행에서 에뮬레이터의 구글 창이 돌아오지 않을 때가 있어(이 화면과 무관) 한 번 더 돌린다
test.describe.configure({ retries: 1 });

test.beforeEach(async () => {
  await clearEmulators();
});

async function signInAdmin(page: Page) {
  await page.goto(ADMIN);
  await page.waitForLoadState('networkidle'); // 처음 띄운 개발 서버에서 인증 준비 전에 누르면 창이 돌아오지 않는다
  const popupPromise = page.context().waitForEvent('page');
  await page.getByRole('button', { name: '구글로 로그인' }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.getByText('Add new account').click();
  await popup.getByText('Auto-generate user information').click();
  await popup.getByText('Sign in with Google.com').click();
  await expect(page.getByRole('button', { name: '다시 확인' })).toBeVisible({ timeout: 60_000 });
  const [user] = await accounts();
  await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/demo-yaguking/accounts:update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: user!.localId, customAttributes: JSON.stringify({ admin: true }), emailVerified: true }),
  });
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible({ timeout: 15_000 });
}

test('묶음을 확인해 승인·철회·보류하고, 안내와 돌아보기 묶음을 만든다', async ({ page }) => {
  test.setTimeout(120_000);
  await seedDraft();
  await signInAdmin(page);

  await page.getByRole('link', { name: '어제의 퀴즈' }).click();
  await page.getByRole('button', { name: new RegExp(`^${DAY}`) }).click();
  const detail = page.getByRole('region', { name: `묶음 ${DAY}` });
  await expect(detail.getByText('검토용 해설')).toBeVisible();
  await expect(detail.getByRole('link', { name: '검토용 출처' })).toHaveAttribute('href', 'https://example.test/review');

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((item) => item.id)).toEqual([]);

  await detail.getByRole('button', { name: '승인' }).click();
  await expect.poll(async () => (await readDoc(`kboSets/${DAY}`))?.state).toEqual({ stringValue: 'approved' });
  await detail.getByRole('button', { name: '문항 철회' }).click();
  await expect(detail.getByText('철회됨')).toBeVisible();
  await detail.getByRole('button', { name: '보류(내리기)' }).click();
  await expect.poll(async () => (await readDoc(`kboSets/${DAY}`))?.state).toEqual({ stringValue: 'held' });

  // 경기 없음 안내 — 시작일 묶음
  const creator = page.getByRole('region', { name: '새 묶음' });
  await expect(creator.getByLabel('여는 날(그날 06:00)')).toHaveValue(KBO_QUIZ_START);
  await creator.getByRole('button', { name: '경기 없음 안내' }).click();
  await expect.poll(async () => (await readDoc(`kboSets/${KBO_QUIZ_START}`))?.kind).toEqual({ stringValue: 'no-game' });

  // 돌아보기 — 출처 없이는 더할 수 없다
  await creator.getByLabel('여는 날(그날 06:00)').fill('2026-12-02');
  await creator.getByLabel('문제', { exact: true }).fill('돌아보기 테스트 문제는?');
  for (const [index, label] of ['A', 'B', 'C', 'D'].entries()) await creator.getByLabel(`보기 ${label}`).fill(`보기${index}`);
  await creator.getByLabel('기준일').fill('2026-11-11');
  await creator.getByLabel('해설').fill('돌아보기 해설');
  await creator.getByRole('button', { name: '문항 더하기' }).click();
  await expect(page.getByRole('alert')).toContainText('출처');
  await creator.getByLabel('출처 이름').fill('돌아보기 출처');
  await creator.getByLabel('출처 주소').fill('https://example.test/season');
  await creator.getByRole('button', { name: '문항 더하기' }).click();
  await creator.getByRole('button', { name: '초안 저장' }).click();
  await expect.poll(async () => (await readDoc('kboSets/2026-12-02'))?.state).toEqual({ stringValue: 'draft' });
  expect((await readDoc('kboSets/2026-12-02/keys/0'))?.correct).toEqual({ stringValue: 'A' });

  // 관리자 기록에 남는다
  const logs = await listDocs('adminLogs');
  const actions = logs.map((item) => (item.fields.action as { stringValue: string }).stringValue);
  expect(actions).toEqual(expect.arrayContaining(['kboSet.approved', 'kboSet.withdraw', 'kboSet.held', 'kboSet.save']));
});

test('소식 가져오기: KBO 공식 사이트는 막고, 가져온 소식으로 구단 문제 초안을 묶음에 더한다', async ({ page }) => {
  test.setTimeout(120_000);
  await patchDoc('newsItems/item1', {
    title: string('테스트 구단, 테스트 대회 우승'),
    link: string('https://news.example/item1'),
    summary: string('지어낸 테스트 소식'),
    feedName: string('테스트 신문'),
    feedId: string('f1'),
    publishedAt: { timestampValue: new Date(Date.now() - 3_600_000).toISOString() },
  });
  await signInAdmin(page);
  await page.getByRole('link', { name: '소식 가져오기' }).click();

  const feeds = page.getByRole('region', { name: '피드' });
  await feeds.getByLabel('피드 이름').fill('공식 사이트');
  await feeds.getByLabel('RSS 주소').fill('https://www.koreabaseball.com/rss.xml');
  await feeds.getByLabel('이용 조건 주소').fill('https://www.koreabaseball.com/Etc/Policy.aspx');
  await feeds.getByRole('button', { name: '피드 더하기' }).click();
  await expect(page.getByRole('alert')).toContainText('약관');
  await feeds.getByLabel('피드 이름').fill('테스트 신문');
  await feeds.getByLabel('RSS 주소').fill('https://news.example/rss');
  await feeds.getByLabel('이용 조건 주소').fill('https://news.example/terms');
  await feeds.getByLabel(/이용 조건을 읽었고/).check();
  await feeds.getByRole('button', { name: '피드 더하기' }).click();
  await expect(feeds.getByText('이용 조건 확인함')).toBeVisible();

  await page.getByRole('button', { name: '이 소식으로 문제 만들기' }).click();
  const builder = page.getByRole('region', { name: '문제 만들기' });
  await builder.getByLabel('문제', { exact: true }).fill('테스트 대회에서 우승한 구단은?');
  await builder.getByLabel('정답 구단').selectOption('한화 이글스');
  await builder.getByLabel('넣을 묶음(여는 날)').fill('2026-12-03');
  await builder.getByRole('button', { name: '묶음에 더하기' }).click();
  await expect(page.getByRole('status')).toContainText('2026-12-03 묶음에 초안으로 더했어요');

  const set = await readDoc('kboSets/2026-12-03');
  expect(set?.kind).toEqual({ stringValue: 'news' });
  expect(set?.state).toEqual({ stringValue: 'draft' });
  const key = await readDoc('kboSets/2026-12-03/keys/0');
  expect(key?.sourceUrl).toEqual({ stringValue: 'https://news.example/item1' });
  const options = ((set?.questions as { arrayValue: { values: { mapValue: { fields: { options: { arrayValue: { values: { mapValue: { fields: { label: { stringValue: string }; text: { stringValue: string } } } }[] } } } } }[] } }).arrayValue.values[0]!.mapValue.fields.options.arrayValue.values).map((option) => option.mapValue.fields);
  expect(options.find((option) => option.label.stringValue === (key?.correct as { stringValue: string }).stringValue)?.text.stringValue).toBe('한화 이글스');
});
