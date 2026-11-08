import { describe, expect, it } from 'vitest';
import { KBO_ATTEMPT_RETENTION_DAYS as OPS_RETENTION, KBO_TEAMS, addDays, candidatesOf, checkGame, dedupeGames, difficultyPlan, documentProblem, gameHash, generateSet, normalizeGame, summarizeAttempts } from '../../ops/kbo.mjs';
import { KBO_PRIVACY_EFFECTIVE, PRIVACY_VERSIONS, versionInForce } from '@/content/privacy';
import { KBO_ATTEMPT_RETENTION_DAYS, KBO_QUIZ_START, currentSetId, dateLabel, headlineOf, kboQuestionProblem, nextSetId, previousSetId, publishAtOf } from '@/lib/kbo/set';
import { TEAMS } from '@/content/teams';
import { finalGame } from '../fixtures/kboGames';

const kst = (text: string) => Date.parse(`${text}+09:00`);
const DATE = '2026-05-10';

describe('경기 검증', () => {
  it('맞는 경기는 통과한다', () => {
    expect(checkGame(normalizeGame(finalGame()), DATE)).toEqual({ usable: true, pending: false, problems: [] });
  });

  it('팀 줄임말과 띄어쓰기를 맞춘다', () => {
    const game = normalizeGame(finalGame({ home: { team: 'LG', runs: 5, innings: [1, 0, 0, 2, 0, 0, 2, 0, 0] } }));
    expect(game.home.team).toBe('LG 트윈스');
    expect(normalizeGame({ ...finalGame(), winningPitcher: ' 투수가 ' }).winningPitcher).toBe('투수가');
  });

  it('이닝 합이 최종 점수와 다르면 뺀다', () => {
    const check = checkGame(normalizeGame(finalGame({ home: { team: 'LG 트윈스', runs: 6, innings: [1, 0, 0, 2, 0, 0, 2, 0, 0] } })), DATE);
    expect(check.usable).toBe(false);
    expect(check.problems.join()).toMatch(/이닝 점수 합/);
  });

  it('승패 투수가 이긴 팀·진 팀 소속이 아니면 뺀다', () => {
    const check = checkGame(normalizeGame(finalGame({ winningPitcher: '투수다' })), DATE);
    expect(check.usable).toBe(false);
    expect(check.problems.join()).toMatch(/승리투수/);
  });

  it('확정 전 기록은 대기, 취소는 쓰지 않음', () => {
    expect(checkGame(normalizeGame(finalGame({ status: 'provisional' })), DATE)).toMatchObject({ usable: false, pending: true });
    expect(checkGame(normalizeGame(finalGame({ status: 'cancelled' })), DATE)).toMatchObject({ usable: false, pending: false });
  });

  it('다른 날 경기를 어제 경기로 쓰지 않는다', () => {
    const check = checkGame(normalizeGame(finalGame()), '2026-05-11');
    expect(check.usable).toBe(false);
    expect(check.problems.join()).toMatch(/대상일/);
  });

  it('무승부는 승패 투수가 없어야 한다', () => {
    const tie = finalGame({
      home: { team: 'LG 트윈스', runs: 3, innings: [1, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0] },
      away: { team: '두산 베어스', runs: 3, innings: [0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0] },
    });
    expect(checkGame(normalizeGame(tie), DATE).usable).toBe(false);
    expect(checkGame(normalizeGame({ ...tie, winningPitcher: '', losingPitcher: '', savePitcher: '' }), DATE).usable).toBe(true);
  });

  it('끝내기는 홈팀만', () => {
    const away = finalGame({
      home: { team: 'LG 트윈스', runs: 1, innings: [1, 0, 0, 0, 0, 0, 0, 0, 0] },
      away: { team: '두산 베어스', runs: 3, innings: [0, 0, 0, 0, 0, 3, 0, 0, 0] },
      winningPitcher: '투수다',
      losingPitcher: '투수가',
      savePitcher: '',
      walkOff: true,
    });
    expect(checkGame(normalizeGame(away), DATE).problems.join()).toMatch(/끝내기/);
  });

  it('출처가 없으면 뺀다', () => {
    expect(checkGame(normalizeGame(finalGame({ source: { name: '', url: '', at: '' } })), DATE).usable).toBe(false);
  });

  it('경기 ID·날짜가 같으면 하나로, 확정 기록을 남긴다', () => {
    const provisional = normalizeGame(finalGame({ status: 'provisional' }));
    const final = normalizeGame(finalGame());
    expect(dedupeGames([provisional, final])).toEqual([final]);
    expect(dedupeGames([final, provisional])).toEqual([final]);
  });

  it('출처 확인일이 바뀌는 것은 정정이 아니다', () => {
    const later = normalizeGame(finalGame({ source: { name: '테스트 데이터', url: 'https://example.test/g', at: '2026-05-12' } }));
    expect(gameHash(later)).toBe(gameHash(normalizeGame(finalGame())));
    expect(gameHash(normalizeGame(finalGame({ savePitcher: '투수나' })))).toBe(gameHash(normalizeGame(finalGame())));
    expect(gameHash(normalizeGame(finalGame({ savePitcher: '' })))).not.toBe(gameHash(normalizeGame(finalGame())));
  });

  it('팀 목록이 앱의 구단 목록과 같다', () => {
    expect([...KBO_TEAMS].sort()).toEqual(TEAMS.map((team) => team.name).sort());
  });
});

describe('문항 생성', () => {
  const game = normalizeGame(finalGame());

  it('난이도는 50·35·15에 가장 가깝게(5문제 2·2·1)', () => {
    expect(difficultyPlan(5)).toEqual({ easy: 2, normal: 2, hard: 1 });
    expect(difficultyPlan(10)).toEqual({ easy: 5, normal: 3, hard: 2 });
    expect(Object.values(difficultyPlan(7)).reduce((a: number, b: number) => a + b, 0)).toBe(7);
  });

  it('5문제를 만들고, 난이도·정답 하나·출처·해설을 지킨다', () => {
    const { documents, problems } = generateSet([game], { total: 5, seed: 'a' });
    expect(problems).toEqual([]);
    expect(documents).toHaveLength(5);
    expect(documents.map((item: { question: { difficulty: string } }) => item.question.difficulty)).toEqual(['easy', 'easy', 'normal', 'normal', 'hard']);
    expect(new Set(documents.map((item: { question: { stem: string } }) => item.question.stem)).size).toBe(5);
    for (const document of documents) {
      expect(documentProblem(document)).toBeNull();
      expect(JSON.stringify(document.question)).not.toContain('correct');
      expect(document.key.sourceUrl).toMatch(/^https:/);
      expect(document.key.gameIds).toEqual([game.gameId]);
    }
  });

  it('공개 문항에 정답 표시가 있으면 걸러 낸다', () => {
    const { documents } = generateSet([game], { total: 1, seed: 'a' });
    expect(documentProblem({ ...documents[0], question: { ...documents[0].question, correct: 'A' } })).toMatch(/정답/);
  });

  it('같은 입력이면 같은 결과(다시 돌려도 겹치지 않는다)', () => {
    expect(generateSet([game], { total: 5, seed: 'x' })).toEqual(generateSet([game], { total: 5, seed: 'x' }));
  });

  it('정답은 구조 데이터에서 나온다', () => {
    const random = () => 0.1;
    const candidates = candidatesOf(game, random);
    const byType = (type: string) => candidates.find((item: { type: string }) => item.type === type);
    expect(byType('winner').correct).toBe('LG 트윈스');
    expect(byType('final-score').correct).toBe('2 : 5');
    expect(byType('winning-pitcher').correct).toBe('투수가');
    expect(byType('home-run').correct).toBe('타자가');
    expect(byType('top-rbi').correct).toBe('타자가');
  });

  it('오답 보기는 그 경기의 실제 이름이다', () => {
    const candidates = candidatesOf(game, () => 0.3);
    const hitters = game.batters.map((item: { player: string }) => item.player);
    expect(candidates.find((item: { type: string }) => item.type === 'home-run').wrong.every((name: string) => hitters.includes(name))).toBe(true);
    const pitchers = game.pitchers.map((item: { player: string }) => item.player);
    expect(candidates.find((item: { type: string }) => item.type === 'winning-pitcher').wrong.every((name: string) => pitchers.includes(name))).toBe(true);
    for (const candidate of candidates) expect(new Set([candidate.correct, ...candidate.wrong]).size).toBe(4);
  });

  it('최다 타점이 동률이면 그 문항을 만들지 않는다', () => {
    const tied = normalizeGame(finalGame({ batters: finalGame().batters.map((item) => ({ ...item, rbi: 1 })) }));
    expect(candidatesOf(tied, () => 0.3).some((item: { type: string }) => item.type === 'top-rbi')).toBe(false);
  });

  it('연장·완봉·끝내기 문항', () => {
    const special = normalizeGame(
      finalGame({
        home: { team: 'LG 트윈스', runs: 1, innings: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] },
        away: { team: '두산 베어스', runs: 0, innings: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
        walkOff: true,
      }),
    );
    expect(checkGame(special, DATE).usable).toBe(true);
    const types = candidatesOf(special, () => 0.3).map((item: { type: string }) => item.type);
    expect(types).toEqual(expect.arrayContaining(['extra-innings', 'shutout', 'walk-off']));
  });

  it('무승부에는 승패 문항이 없다', () => {
    const tie = normalizeGame(
      finalGame({
        home: { team: 'LG 트윈스', runs: 3, innings: [1, 0, 0, 2, 0, 0, 0, 0, 0] },
        away: { team: '두산 베어스', runs: 3, innings: [0, 0, 0, 0, 0, 3, 0, 0, 0] },
        winningPitcher: '',
        losingPitcher: '',
        savePitcher: '',
      }),
    );
    const types = candidatesOf(tie, () => 0.3).map((item: { type: string }) => item.type);
    expect(types).not.toContain('winner');
    expect(types).not.toContain('winning-pitcher');
    expect(types).toContain('final-score');
  });

  it('문항이 모자라면 있는 만큼만 낸다(지어내지 않는다)', () => {
    const thin = normalizeGame(finalGame({ batters: [], homeRuns: [], pitchers: finalGame().pitchers.slice(0, 2) }));
    const { documents } = generateSet([thin], { total: 10, seed: 'a' });
    expect(documents.length).toBeGreaterThan(0);
    expect(documents.length).toBeLessThan(10);
  });
});

describe('날짜', () => {
  it('묶음은 06:00에 넘어간다', () => {
    expect(currentSetId(kst('2026-11-21T05:59:00'))).toBe('2026-11-20');
    expect(currentSetId(kst('2026-11-21T06:00:00'))).toBe('2026-11-21');
    expect(previousSetId('2026-12-01')).toBe('2026-11-30');
    expect(publishAtOf('2026-11-21')).toBe(kst('2026-11-21T06:00:00'));
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('새 묶음 날짜는 시작일보다 앞서지 않는다', () => {
    expect(nextSetId(kst('2026-11-05T12:00:00'))).toBe(KBO_QUIZ_START);
    expect(nextSetId(kst('2027-03-01T05:00:00'))).toBe('2027-03-01');
    expect(nextSetId(kst('2027-03-01T07:00:00'))).toBe('2027-03-02');
  });

  it('"어제"는 실제로 어제일 때만 쓴다', () => {
    const noon = kst('2027-04-02T12:00:00');
    expect(headlineOf({ kind: 'no-game', gamesDate: '2027-04-01' }, noon)).toBe('어제는 경기가 없었어요');
    expect(headlineOf({ kind: 'no-game', gamesDate: '2027-03-30' }, noon)).toBe('3월 30일은 경기가 없었어요');
    expect(headlineOf({ kind: 'quiz', gamesDate: '2027-03-30' }, noon)).toBe('3월 30일 경기 퀴즈');
    expect(dateLabel('2027-11-05')).toBe('11월 5일');
  });

  it('보관 기간은 화면·운영 작업이 같다', () => {
    expect(OPS_RETENTION).toBe(KBO_ATTEMPT_RETENTION_DAYS);
  });
});

describe('처리방침', () => {
  it('시작일이 처리방침 판 시행일이고, 그 전날까지는 답을 모으지 않는다', () => {
    expect(KBO_PRIVACY_EFFECTIVE).toBe(KBO_QUIZ_START);
    expect(PRIVACY_VERSIONS.at(-1)?.effective).toBe(KBO_QUIZ_START);
    expect(versionInForce(addDays(KBO_QUIZ_START, -1)).effective).not.toBe(KBO_QUIZ_START);
    expect(JSON.stringify(versionInForce(KBO_QUIZ_START).sections)).toContain('어제의 KBO 퀴즈');
    expect(JSON.stringify(versionInForce(addDays(KBO_QUIZ_START, -1)).sections)).not.toContain('어제의 KBO 퀴즈 답');
  });
});

describe('관리자 입력 확인', () => {
  const question = {
    stem: '2026 KBO 정규시즌 1위 팀은?',
    options: (['A', 'B', 'C', 'D'] as const).map((label, index) => ({ label, text: `보기${index}` })),
    difficulty: 'easy' as const,
    category: 'team-history' as const,
    recordAsOf: '2026-11-11',
    seasonScope: '2026 시즌',
  };
  const key = { correct: 'B' as const, explanation: '해설', sourceName: '출처', sourceUrl: 'https://example.test/a', recordAsOf: '2026-11-11' };

  it('맞으면 통과, 출처·해설·겹친 보기는 막는다', () => {
    expect(kboQuestionProblem(question, key)).toBeNull();
    expect(kboQuestionProblem(question, { ...key, sourceUrl: 'http://example.test' })).toMatch(/https/);
    expect(kboQuestionProblem(question, { ...key, explanation: ' ' })).toMatch(/해설/);
    expect(kboQuestionProblem({ ...question, options: question.options.map((option) => ({ ...option, text: '같음' })) }, key)).toMatch(/서로/);
  });
});

describe('집계', () => {
  const attempt = (uid: string, guest: boolean, choices: (string | null)[], signupClicked = false) => ({
    uid,
    guest,
    signupClicked,
    answers: Object.fromEntries(choices.map((choice, index) => [String(index), { choice }])),
  });

  it('사람당 한 번씩 세고 철회 문항은 정답률에서 뺀다', () => {
    const summary = summarizeAttempts({
      attempts: [attempt('a', true, ['A', 'B'], true), attempt('b', true, ['B']), attempt('c', false, []), attempt('d', true, [null, 'C'])],
      correct: { 0: 'A', 1: 'B' },
      withdrawn: [1],
      total: 2,
      previousUids: new Set(['a', 'c']),
      signedUpUids: new Set(['a', 'c']),
    });
    expect(summary).toMatchObject({ views: 4, guestViews: 3, starts: 3, completes: 2, signupClicks: 1, signupCompletes: 1, returned: 2 });
    expect(summary.questions[0]).toEqual({ index: 0, answered: 3, correct: 1 });
    expect(summary.questions[1]).toEqual({ index: 1, answered: 0, correct: 0 });
    expect(JSON.stringify(summary)).not.toMatch(/"a"|"uid"/);
  });
});
