import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/lib/db/sql';
import type { Owner } from '@/server/play/owner';
import { defaultModeFor, getOrStartGame } from '@/server/play/resume';
import { startSession } from '@/server/play/startSession';
import {
  assertLocalDatabase,
  cleanup,
  createQuestionPool,
  createUser,
  hasDatabase,
  resetPlayData,
} from './helpers/fixtures';

/**
 * 경기 시작 화면(`/play`) — 메인 페이지의 "게임 시작"이 여기로 온다.
 *
 * 회원이 체험으로 시작되면 공식 집계가 없어 기록·XP가 쌓이지 않는다. 메인 페이지를
 * 소개 화면으로 바꾼 직후 실제로 그랬다(2026-10-26).
 */
describe.skipIf(!hasDatabase())('경기 시작 화면의 기본 모드', () => {
  beforeAll(async () => {
    assertLocalDatabase();
    await cleanup();
    await createQuestionPool(20);
  });

  afterEach(async () => {
    await resetPlayData();
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  const guest = (): Owner => ({ kind: 'guest', tokenHash: `test-${randomUUID()}` });

  it('회원은 공식 3이닝으로 시작한다 — 공식 집계 대상', async () => {
    const owner: Owner = { kind: 'user', userId: await createUser() };
    const started = await getOrStartGame(owner);
    expect(started.mode).toBe('official_3');
    expect(started.official).toBe(true);
  });

  it('비회원은 체험 1이닝으로 시작한다', async () => {
    const started = await getOrStartGame(guest());
    expect(started.mode).toBe('trial');
    expect(started.official).toBe(false);
  });

  it('진행 중인 경기가 있으면 새로 만들지 않고 이어 간다 — 회원', async () => {
    const owner: Owner = { kind: 'user', userId: await createUser() };
    const first = await getOrStartGame(owner);
    const again = await getOrStartGame(owner);
    expect(again.sessionId).toBe(first.sessionId);
  });

  it('회원이 모드 목록에서 고른 진행 중 경기는 모드가 바뀌지 않고 이어진다', async () => {
    const owner: Owner = { kind: 'user', userId: await createUser() };
    const daily = await startSession({ mode: 'daily' }, owner);
    const resumed = await getOrStartGame(owner);
    expect(resumed.sessionId).toBe(daily.sessionId);
    expect(resumed.mode).toBe('daily');
  });

  it('회원에게 남은 미완료 체험은 이어 가지 않고 공식 경기를 새로 연다', async () => {
    const owner: Owner = { kind: 'user', userId: await createUser() };
    // 예전 경로가 회원에게 열어 둔 체험(공식 집계 없음)
    const leftover = await startSession({ mode: 'trial' }, owner);
    const started = await getOrStartGame(owner);
    expect(started.sessionId).not.toBe(leftover.sessionId);
    expect(started.mode).toBe('official_3');
  });

  it('defaultModeFor: 회원은 공식, 비회원은 체험', () => {
    expect(defaultModeFor({ kind: 'user', userId: 'u' })).toBe('official_3');
    expect(defaultModeFor({ kind: 'guest', tokenHash: 'g' })).toBe('trial');
  });
});
