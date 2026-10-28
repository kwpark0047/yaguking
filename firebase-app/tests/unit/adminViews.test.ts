import { describe, expect, it } from 'vitest';
import {
  FLAG_RULES,
  ROOM_EXPIRE_MS,
  ROOM_STALL_MS,
  funnelOf,
  gameFlags,
  gamesSummary,
  hardestQuestions,
  kstDayStart,
  memberStatus,
  membersSummary,
  emailUnverified,
  roomFlags,
  roomProgress,
  roomsSummary,
  type GameViewRow,
  type MemberViewRow,
  type RoomViewRow,
} from '@/lib/admin/views';

/** 관리자 "한 번 읽기" 보기의 계산(docs/admin-dashboard-plan.md) */
const NOW = Date.UTC(2026, 9, 28, 6); // 한국 시간 10-28 15:00
const DAY = 86_400_000;

const member = (patch: Partial<MemberViewRow> = {}): MemberViewRow => ({
  uid: 'u1',
  email: 'kw@example.test',
  emailVerified: true,
  providers: ['google.com'],
  createdAt: NOW - 2 * DAY,
  lastSignInAt: NOW - DAY,
  disabled: false,
  admin: false,
  ageConfirmedAt: NOW - 2 * DAY,
  nickname: '곰돌이',
  favoriteTeams: ['lg'],
  levelTest: { tier: 3, correct: 12, total: 20, at: NOW - DAY },
  games: 4,
  hits: 3,
  atBats: 10,
  homeRuns: 1,
  lastGameAt: NOW - DAY,
  ...patch,
});

describe('회원 상태 — 가입이 덜 끝난 것부터 하나', () => {
  it('14세 미확인 → 프로필 미완료 → 레벨 테스트 안 함 → 활동 중·보통·오래 안 옴', () => {
    expect(memberStatus(member({ ageConfirmedAt: null }), NOW)).toBe('needs-age');
    expect(memberStatus(member({ nickname: null }), NOW)).toBe('needs-profile');
    expect(memberStatus(member({ favoriteTeams: [] }), NOW)).toBe('needs-profile');
    expect(memberStatus(member({ levelTest: null }), NOW)).toBe('needs-level-test');
    expect(memberStatus(member(), NOW)).toBe('active');
    expect(memberStatus(member({ lastSignInAt: NOW - 30 * DAY }), NOW)).toBe('idle');
    expect(memberStatus(member({ lastSignInAt: NOW - 91 * DAY }), NOW)).toBe('dormant');
  });

  it('이메일 미인증은 이메일 가입만(구글은 구글이 인증)', () => {
    expect(emailUnverified(member({ providers: ['password'], emailVerified: false }))).toBe(true);
    expect(emailUnverified(member({ providers: ['google.com'], emailVerified: false }))).toBe(false);
  });

  it('가입 깔때기와 요약: 오늘 가입·3일 넘게 14세 미확인', () => {
    const rows = [
      member(),
      member({ uid: 'u2', ageConfirmedAt: null, nickname: null, favoriteTeams: [], levelTest: null, games: 0, createdAt: NOW - 4 * DAY }),
      member({ uid: 'u3', levelTest: null, games: 0, createdAt: kstDayStart(NOW) + 60_000 }),
    ];
    expect(funnelOf(rows)).toEqual({ signedUp: 3, ageConfirmed: 2, profile: 2, levelTest: 1, firstGame: 1 });
    expect(membersSummary(rows, NOW)).toMatchObject({ members: 2, accounts: 3, signupsToday: 1, stuckSignups: 1 });
  });
});

const atBat = (correct: boolean, elapsedMs: number, choice: string | null = 'A', result = correct ? 'HR' : 'K') => ({
  questionId: correct ? 'q-easy' : 'q-hard',
  choice,
  correct,
  elapsedMs,
  result,
  rbi: 0,
});
const game = (patch: Partial<GameViewRow> = {}): GameViewRow => ({
  id: 'g1',
  uid: 'u1',
  nickname: '곰돌이',
  member: true,
  mode: 'practice',
  createdAt: kstDayStart(NOW) + 15 * 3_600_000,
  runs: 1,
  pa: 4,
  atBats: [atBat(true, 2000, 'A'), atBat(false, 3000, 'B'), atBat(false, 4000, 'C'), atBat(false, 3500, 'D')],
  ...patch,
});

describe('오늘 경기 — 요약·이상 징후(표시만)', () => {
  it('너무 빠름: 평균 응답이 기준보다 짧고 거의 다 맞힘', () => {
    const fast = game({ atBats: [atBat(true, 300, 'A'), atBat(true, 400, 'B'), atBat(true, 500, 'C')] });
    expect(gameFlags(fast, 1)).toEqual(['too-fast']);
    expect(gameFlags(game(), 1)).toEqual([]);
  });

  it('같은 답 반복, 하루 경기 과다', () => {
    const same = game({ atBats: [atBat(false, 2000, 'A'), atBat(false, 2000, 'A'), atBat(true, 2000, 'A')] });
    expect(gameFlags(same, 1)).toEqual(['same-choice']);
    expect(gameFlags(game(), FLAG_RULES.manyGamesPerDay + 1)).toEqual(['too-many']);
  });

  it('요약: 경기·플레이어·평균·정답률·홈런 비율·시간대(한국 시간)', () => {
    const rows = [game(), game({ id: 'g2', uid: 'u2', member: false, nickname: null, runs: 3, mode: 'levelTest' })];
    const summary = gamesSummary(rows);
    expect(summary).toMatchObject({ games: 2, practice: 1, levelTests: 1, memberGames: 1, guestGames: 1, players: 2, averageRuns: 2, averagePa: 4 });
    expect(summary.correctRate).toBe(0.25);
    expect(summary.homeRunRate).toBe(0.25);
    expect(summary.hourly[15]).toBe(2);
  });

  it('많이 틀린 문항은 3번 이상 나온 것만, 정답률 낮은 순', () => {
    const hardest = hardestQuestions([game(), game({ id: 'g2' })]);
    expect(hardest[0]).toEqual({ questionId: 'q-hard', shown: 6, rate: 0 });
    expect(hardest.find((item) => item.questionId === 'q-easy')).toBeUndefined(); // 2번만 나옴
  });
});

const room = (patch: Partial<RoomViewRow> = {}): RoomViewRow => ({
  code: 'ABC234',
  status: 'playing',
  hostUid: 'h',
  createdAt: NOW - 30 * 60_000,
  startedAt: NOW - 20 * 60_000,
  maxPlayers: 4,
  players: 2,
  questions: 5,
  seats: [
    { uid: 'h', nickname: '방장', score: 300, answered: 3, correct: 2, lastAnswerAt: NOW - 60_000 },
    { uid: 'f', nickname: '친구', score: 100, answered: 2, correct: 1, lastAnswerAt: NOW - 2 * 60_000 },
  ],
  ...patch,
});

describe('대결 방 — 멈춤·시작 안 함·정리 대상(정리 작업과 같은 24시간)', () => {
  it('진행 중인데 10분 넘게 새 답이 없으면 멈춤, 다 답했으면 아님', () => {
    expect(roomFlags(room(), NOW)).toEqual([]);
    const quiet = room({ seats: room().seats.map((seat) => ({ ...seat, lastAnswerAt: NOW - ROOM_STALL_MS - 1 })) });
    expect(roomFlags(quiet, NOW)).toEqual(['stalled']);
    const done = room({ seats: quiet.seats.map((seat) => ({ ...seat, answered: 5 })) });
    expect(roomFlags(done, NOW)).toEqual([]);
  });

  it('대기 1시간 넘으면 시작 안 함, 24시간 지나면 정리 대상만', () => {
    expect(roomFlags(room({ status: 'waiting', createdAt: NOW - 2 * 3_600_000 }), NOW)).toEqual(['waiting-long']);
    expect(roomFlags(room({ createdAt: NOW - ROOM_EXPIRE_MS - 1 }), NOW)).toEqual(['expired']);
  });

  it('진행률과 요약', () => {
    expect(roomProgress(room())).toBe(0.5);
    const rows = [room(), room({ code: 'B', status: 'waiting' }), room({ code: 'C', status: 'finished', createdAt: NOW - 2 * DAY })];
    expect(roomsSummary(rows, NOW)).toMatchObject({ rooms: 3, waiting: 1, playing: 1, finished: 1, expired: 1, stalled: 0 });
  });
});
