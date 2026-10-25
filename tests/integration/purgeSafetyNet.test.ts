import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '@/lib/db/sql';
import { maybeRunDailyPurge, resetPurgeCheckForTest } from '@/server/privacy/purge';
import { assertLocalDatabase, hasDatabase } from './helpers/fixtures';

/**
 * 보관 기간 파기의 안전망 (src/server/privacy/purge.ts).
 * 운영자가 크론을 빠뜨려도 하루 한 번은 돌고, 그 이상은 돌지 않아야 한다.
 */
describe.skipIf(!hasDatabase())('파기 안전망', () => {
  let saved: Date | null = null;

  beforeAll(async () => {
    assertLocalDatabase();
    const [row] = await getDb()<{ last_run_at: Date }[]>`
      select last_run_at from public.maintenance_runs where job = 'privacy_purge'
    `;
    saved = row?.last_run_at ?? null;
  });

  beforeEach(() => {
    resetPurgeCheckForTest();
  });

  afterAll(async () => {
    // 개발 DB의 실제 실행 기록을 되돌려 둔다.
    await getDb()`delete from public.maintenance_runs where job = 'privacy_purge'`;
    if (saved) {
      await getDb()`insert into public.maintenance_runs (job, last_run_at) values ('privacy_purge', ${saved})`;
    }
    await closeDb();
  });

  const setLastRun = (sql: string) =>
    getDb().unsafe(
      `insert into public.maintenance_runs (job, last_run_at) values ('privacy_purge', ${sql})
       on conflict (job) do update set last_run_at = excluded.last_run_at`,
    );

  it('하루가 지났으면 돌고 실행 시각을 갱신한다', async () => {
    await setLastRun(`now() - interval '25 hours'`);
    expect(await maybeRunDailyPurge()).toBe(true);
    const [row] = await getDb()<{ fresh: boolean }[]>`
      select last_run_at > now() - interval '1 minute' as fresh
        from public.maintenance_runs where job = 'privacy_purge'
    `;
    expect(row!.fresh).toBe(true);
  });

  it('하루가 안 지났으면 돌지 않는다', async () => {
    await setLastRun(`now() - interval '2 hours'`);
    expect(await maybeRunDailyPurge()).toBe(false);
  });

  it('기록이 아예 없으면(첫 배포) 돈다', async () => {
    await getDb()`delete from public.maintenance_runs where job = 'privacy_purge'`;
    expect(await maybeRunDailyPurge()).toBe(true);
  });

  it('같은 프로세스에서 10분 안에 다시 묻지 않는다', async () => {
    await setLastRun(`now() - interval '25 hours'`);
    const now = Date.now();
    expect(await maybeRunDailyPurge(getDb(), now)).toBe(true);
    await setLastRun(`now() - interval '25 hours'`);
    expect(await maybeRunDailyPurge(getDb(), now + 60_000)).toBe(false);
    expect(await maybeRunDailyPurge(getDb(), now + 11 * 60_000)).toBe(true);
  });
});
