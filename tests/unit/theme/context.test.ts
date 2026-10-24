import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 테마 자동 적용 규칙 (src/server/theme/context.ts).
 *
 * 루트 레이아웃이 모든 화면에서 부르므로 **어떤 경우에도 던지면 안 된다.**
 * 테마 때문에 화면이 죽는 일은 없어야 한다.
 */

const auth = vi.hoisted(() => ({
  userId: null as string | null,
  /** 인증 확인 중에 던질 오류. Next 내부 신호를 흉내 낸다. */
  throws: null as (() => never) | null,
}));
const db = vi.hoisted(() => ({
  rows: [] as { slug: string | null; level: number }[],
  fail: false,
}));

vi.mock('@/lib/supabase/server', () => ({
  getAuthUserId: async () => {
    if (auth.throws) auth.throws();
    return auth.userId;
  },
}));

vi.mock('@/lib/db/sql', () => ({
  getDb: () => async () => {
    if (db.fail) throw new Error('connection refused');
    return db.rows;
  },
}));

const { getThemeContext } = await import('@/server/theme/context');
const original = process.env.TEAM_THEMES;

beforeEach(() => {
  auth.userId = null;
  auth.throws = null;
  db.rows = [];
  db.fail = false;
  delete process.env.TEAM_THEMES;
});

afterEach(() => {
  if (original === undefined) delete process.env.TEAM_THEMES;
  else process.env.TEAM_THEMES = original;
});

describe('getThemeContext', () => {
  it('비회원은 브랜드 기본, 등급 없음', async () => {
    expect(await getThemeContext()).toEqual({ teamSlug: null, level: null });
  });

  it('회원 + 대표 구단 → 그 구단과 등급', async () => {
    auth.userId = 'u1';
    db.rows = [{ slug: 'lg', level: 5 }];
    expect(await getThemeContext()).toEqual({ teamSlug: 'lg', level: 5 });
  });

  it('회원이지만 구단 미설정 → 브랜드 기본 + 등급', async () => {
    auth.userId = 'u1';
    db.rows = [{ slug: null, level: 3 }];
    expect(await getThemeContext()).toEqual({ teamSlug: null, level: 3 });
  });

  it('팔레트가 없는 구단 값은 무시한다', async () => {
    auth.userId = 'u1';
    db.rows = [{ slug: 'expansion-team', level: 2 }];
    expect(await getThemeContext()).toEqual({ teamSlug: null, level: 2 });
  });

  it('TEAM_THEMES=off면 구단만 끄고 등급은 유지한다', async () => {
    process.env.TEAM_THEMES = 'off';
    auth.userId = 'u1';
    db.rows = [{ slug: 'kia', level: 7 }];
    expect(await getThemeContext()).toEqual({ teamSlug: null, level: 7 });
  });

  it('DB가 실패해도 던지지 않고 기본으로 떨어진다', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    auth.userId = 'u1';
    db.fail = true;
    await expect(getThemeContext()).resolves.toEqual({ teamSlug: null, level: null });
  });

  /**
   * 회귀 방지. 처음 구현은 모든 오류를 잡아 기본 테마로 떨어뜨렸다. 그러자
   * `cookies()`가 정적 생성 중 던지는 "이 화면은 동적이다" 신호까지 삼켜,
   * 빌드가 /_not-found를 비회원 테마로 정적 생성했다.
   */
  it('Next 내부 신호(redirect 등)는 삼키지 않고 그대로 던진다', async () => {
    const { redirect } = await import('next/navigation');
    auth.throws = () => redirect('/auth');
    await expect(getThemeContext()).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    });
  });

  it('프로필 행이 없으면 1레벨', async () => {
    auth.userId = 'u1';
    db.rows = [];
    expect(await getThemeContext()).toEqual({ teamSlug: null, level: 1 });
  });
});
