/**
 * 어제의 KBO 퀴즈 테스트 데이터 — **지어낸 경기다. 실제 기록이 아니다.** 선수 이름도 자리 표시다.
 * 규칙이 isTest 묶음을 이용자에게 막고, 테스트 데이터는 에뮬레이터에서만 돈다.
 */
export function finalGame(patch: Record<string, unknown> = {}) {
  return {
    gameId: 'TEST-20260510-LG',
    date: '2026-05-10',
    status: 'final',
    stage: 'regular',
    home: { team: 'LG 트윈스', runs: 5, innings: [1, 0, 0, 2, 0, 0, 2, 0, 0] },
    away: { team: '두산 베어스', runs: 2, innings: [0, 0, 1, 0, 0, 1, 0, 0, 0] },
    winningPitcher: '투수가',
    losingPitcher: '투수다',
    savePitcher: '투수나',
    starters: { home: '투수가', away: '투수다' },
    pitchers: [
      { player: '투수가', team: 'LG 트윈스' },
      { player: '투수나', team: 'LG 트윈스' },
      { player: '투수다', team: '두산 베어스' },
      { player: '투수라', team: '두산 베어스' },
    ],
    homeRuns: [{ player: '타자가', team: 'LG 트윈스' }],
    batters: [
      { player: '타자가', team: 'LG 트윈스', hits: 2, rbi: 3, runs: 1 },
      { player: '타자나', team: 'LG 트윈스', hits: 1, rbi: 1, runs: 1 },
      { player: '타자다', team: '두산 베어스', hits: 2, rbi: 1, runs: 0 },
      { player: '타자라', team: '두산 베어스', hits: 1, rbi: 1, runs: 1 },
    ],
    walkOff: false,
    source: { name: '테스트 데이터', url: 'https://example.test/game', at: '2026-05-11' },
    ...patch,
  };
}
