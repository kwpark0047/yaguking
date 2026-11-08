/**
 * 어제의 KBO 퀴즈 — 운영자 PC 작업(docs/daily-kbo-quiz/03-design.md, 저장소 맨 위 docs).
 *
 * 흐름: 출처 어댑터 → 검증 → 틀 기반 문항 생성 → 초안 저장. 공개는 관리자가 승인하고 규칙이 공개 시각에 연다.
 *
 * **실제 경기 기록은 가져오지 않는다.** 이용 권한을 확보하기 전까지 자동 수집을 하지 않는다는 운영 원칙 때문이다.
 * 지금 있는 어댑터는 테스트 데이터(fixture)뿐이고, 그 결과는 isTest: true라서 규칙이 이용자에게 막는다.
 * 계약이 되면 어댑터를 하나 더한다. 나머지는 그대로 쓴다.
 *
 * AI를 쓰지 않는다. 정답은 구조 데이터에서 꺼내고 문장은 틀로 만든다.
 */
import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export const KBO_TEAMS = ['두산 베어스', 'LG 트윈스', '키움 히어로즈', 'SSG 랜더스', 'KT 위즈', 'NC 다이노스', '삼성 라이온즈', '롯데 자이언츠', 'KIA 타이거즈', '한화 이글스'];
const TEAM_ALIASES = new Map(KBO_TEAMS.flatMap((name) => [[name, name], [name.split(' ')[0], name]]));

export const KBO_DEFAULT_TOTAL = 5;
export const KBO_ATTEMPT_RETENTION_DAYS = 30;
const RUNS_KEPT = 30;
/** 어려움까지 나눈 비율(요구서 §5) */
const RATIO = { easy: 0.5, normal: 0.35, hard: 0.15 };
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const DAY = 86_400_000;
const KST = 9 * 3_600_000;

export const kstDateOf = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
export const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const sum = (values) => values.reduce((total, value) => total + value, 0);
const shortDate = (date) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
const shortTeam = (team) => team.split(' ')[0];

/** 같은 입력이면 같은 결과 — 다시 돌려도 문항과 보기 순서가 같다 */
function seededRandom(seed) {
  let state = createHash('sha256').update(String(seed)).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, random) {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [out[index], out[other]] = [out[other], out[index]];
  }
  return out;
}

// ── 검증 ────────────────────────────────────────────────────────────

/** 표기를 맞춘다. 모르는 팀 이름은 그대로 두어 검사에서 걸리게 한다 */
export function normalizeGame(raw) {
  const person = (value) => clean(value);
  const team = (value) => TEAM_ALIASES.get(clean(value)) ?? clean(value);
  const side = (value = {}) => ({ team: team(value.team), runs: value.runs, innings: Array.isArray(value.innings) ? value.innings : [] });
  return {
    gameId: clean(raw.gameId),
    date: clean(raw.date),
    status: clean(raw.status),
    stage: clean(raw.stage) || 'regular',
    home: side(raw.home),
    away: side(raw.away),
    winningPitcher: person(raw.winningPitcher),
    losingPitcher: person(raw.losingPitcher),
    savePitcher: person(raw.savePitcher),
    starters: { home: person(raw.starters?.home), away: person(raw.starters?.away) },
    pitchers: (raw.pitchers ?? []).map((item) => ({ player: person(item.player), team: team(item.team) })),
    homeRuns: (raw.homeRuns ?? []).map((item) => ({ player: person(item.player), team: team(item.team) })),
    batters: (raw.batters ?? []).map((item) => ({ player: person(item.player), team: team(item.team), hits: item.hits, rbi: item.rbi, runs: item.runs })),
    walkOff: raw.walkOff === true,
    source: { name: clean(raw.source?.name), url: clean(raw.source?.url), at: clean(raw.source?.at) },
  };
}

/**
 * 경기 하나를 확인한다. 하나라도 걸리면 그 경기는 문항에 쓰지 않는다.
 * @returns {{ usable: boolean, pending: boolean, problems: string[] }}
 */
export function checkGame(game, expectedDate) {
  const problems = [];
  if (!game.gameId) problems.push('경기 ID가 없다');
  if (game.date !== expectedDate) problems.push(`경기일 ${game.date || '없음'}이 대상일 ${expectedDate}과 다르다`);
  if (!isDate(game.date)) problems.push('경기일 형식이 틀렸다');
  if (game.status === 'cancelled') return { usable: false, pending: false, problems: [...problems, '경기가 취소됐다'] };
  if (game.status === 'provisional') return { usable: false, pending: true, problems: [...problems, '기록이 확정 전이다'] };
  if (game.status !== 'final') problems.push(`끝난 경기가 아니다(${game.status || '상태 없음'})`);

  for (const side of [game.home, game.away]) {
    if (!KBO_TEAMS.includes(side.team)) problems.push(`모르는 팀: ${side.team || '없음'}`);
    if (!Number.isInteger(side.runs) || side.runs < 0) problems.push(`${side.team} 점수가 틀렸다`);
    if (side.innings.length === 0 || !side.innings.every((run) => Number.isInteger(run) && run >= 0)) problems.push(`${side.team} 이닝 점수가 틀렸다`);
    else if (sum(side.innings) !== side.runs) problems.push(`${side.team} 이닝 점수 합(${sum(side.innings)})이 최종 점수(${side.runs})와 다르다`);
  }
  if (game.home.team === game.away.team) problems.push('같은 팀끼리 경기로 적혀 있다');

  const tie = game.home.runs === game.away.runs;
  const winner = game.home.runs > game.away.runs ? game.home.team : game.away.team;
  const loser = game.home.runs > game.away.runs ? game.away.team : game.home.team;
  const pitcherTeam = (name) => game.pitchers.find((item) => item.player === name)?.team;
  if (tie) {
    if (game.winningPitcher || game.losingPitcher) problems.push('무승부인데 승패 투수가 있다');
    if (game.walkOff) problems.push('무승부인데 끝내기로 적혀 있다');
  } else {
    if (!game.winningPitcher) problems.push('승리투수가 없다');
    else if (pitcherTeam(game.winningPitcher) !== winner) problems.push(`승리투수 ${game.winningPitcher}이(가) 이긴 팀 소속이 아니다`);
    if (!game.losingPitcher) problems.push('패전투수가 없다');
    else if (pitcherTeam(game.losingPitcher) !== loser) problems.push(`패전투수 ${game.losingPitcher}이(가) 진 팀 소속이 아니다`);
    if (game.savePitcher && pitcherTeam(game.savePitcher) !== winner) problems.push(`세이브 투수 ${game.savePitcher}이(가) 이긴 팀 소속이 아니다`);
    if (game.walkOff && winner !== game.home.team) problems.push('끝내기는 홈팀만 할 수 있다');
  }

  const teams = [game.home.team, game.away.team];
  for (const list of [game.pitchers, game.homeRuns, game.batters]) {
    for (const item of list) {
      if (!item.player) problems.push('선수 이름이 비어 있다');
      if (!teams.includes(item.team)) problems.push(`${item.player}의 팀 ${item.team}이(가) 이 경기 팀이 아니다`);
    }
  }
  for (const batter of game.batters) {
    for (const key of ['hits', 'rbi', 'runs']) {
      if (!Number.isInteger(batter[key]) || batter[key] < 0) problems.push(`${batter.player}의 ${key} 값이 틀렸다`);
    }
  }
  if (!game.source.name || !/^https:\/\//.test(game.source.url) || !isDate(game.source.at)) problems.push('출처(이름·https 주소·확인일)가 없다');
  return { usable: problems.length === 0, pending: false, problems };
}

/** 경기 ID + 날짜로 겹침을 없앤다. 같은 경기가 둘이면 확정 기록을 남긴다 */
export function dedupeGames(games) {
  const byKey = new Map();
  for (const game of games) {
    const key = `${game.gameId}|${game.date}`;
    const existing = byKey.get(key);
    if (!existing || (existing.status !== 'final' && game.status === 'final')) byKey.set(key, game);
  }
  return [...byKey.values()];
}

/** 정정을 알아내기 위한 값(출처 확인일은 빼고 경기 내용만) */
export function gameHash(game) {
  const { source: _source, ...facts } = game;
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 16);
}

// ── 문항 생성 ────────────────────────────────────────────────────────

const matchName = (game) => `${shortDate(game.date)} ${shortTeam(game.away.team)}-${shortTeam(game.home.team)} 경기`;
const scoreText = (away, home) => `${away} : ${home}`;

/** 다른 경기 팀까지 넣은 실제 팀 이름 보기 */
function otherTeams(game, random, count) {
  return shuffled(KBO_TEAMS.filter((team) => team !== game.home.team && team !== game.away.team), random).slice(0, count);
}

/** 한 경기에서 나올 수 있는 문항 후보. 정답이 하나로 정해지지 않으면 만들지 않는다 */
export function candidatesOf(game, random) {
  const out = [];
  const push = (type, difficulty, stem, correct, wrong, explanation) => {
    const distinct = [...new Set(wrong.map(String))].filter((text) => text !== String(correct));
    if (distinct.length < 3) return;
    out.push({ type, difficulty, stem, correct: String(correct), wrong: distinct.slice(0, 3), explanation, gameIds: [game.gameId] });
  };
  const { home, away } = game;
  const tie = home.runs === away.runs;
  const winner = home.runs > away.runs ? home.team : away.team;
  const loser = home.runs > away.runs ? away.team : home.team;
  const final = `${shortTeam(away.team)} ${away.runs} : ${home.runs} ${shortTeam(home.team)}`;
  const innings = Math.max(home.innings.length, away.innings.length);

  if (!tie) {
    push('winner', 'easy', `${matchName(game)}에서 이긴 팀은?`, winner, [loser, ...otherTeams(game, random, 2)], `${final}로 ${shortTeam(winner)}이(가) 이겼다.`);
    const team = random() < 0.5 ? home.team : away.team;
    const result = team === winner ? '이겼다' : '졌다';
    push('team-result', 'easy', `${shortDate(game.date)} ${shortTeam(team)}의 경기 결과는?`, result, ['이겼다', '졌다', '비겼다', '경기가 취소됐다'], `${final}로 끝났다.`);
  }

  const nearby = [
    [away.runs + 1, home.runs],
    [away.runs, home.runs + 1],
    [Math.max(0, away.runs - 1), home.runs],
    [away.runs, Math.max(0, home.runs - 1)],
    [home.runs, away.runs],
    [away.runs + 2, home.runs + 1],
  ].map(([a, h]) => scoreText(a, h));
  push('final-score', 'normal', `${matchName(game)}의 최종 점수는? (원정 : 홈)`, scoreText(away.runs, home.runs), shuffled(nearby, random), `${final}로 끝났다.`);

  const hitters = new Set(game.homeRuns.map((item) => item.player));
  const noHomers = game.batters.map((item) => item.player).filter((player) => !hitters.has(player));
  if (hitters.size > 0 && noHomers.length >= 3) {
    const hitter = [...hitters][Math.floor(random() * hitters.size)];
    const list = [...hitters].join(', ');
    push('home-run', 'normal', `${matchName(game)}에서 홈런을 친 선수는?`, hitter, shuffled(noHomers, random), `이 경기 홈런 타자: ${list}.`);
  }

  if (!tie) {
    const others = game.pitchers.map((item) => item.player).filter((player) => player !== game.winningPitcher);
    push('winning-pitcher', 'normal', `${matchName(game)}의 승리투수는?`, game.winningPitcher, [game.losingPitcher, ...shuffled(others, random)], `승리투수는 ${game.winningPitcher}, 패전투수는 ${game.losingPitcher}이다.`);
  }

  const topRbi = Math.max(0, ...game.batters.map((item) => item.rbi));
  const leaders = game.batters.filter((item) => item.rbi === topRbi);
  if (topRbi > 0 && leaders.length === 1) {
    push('top-rbi', 'hard', `${matchName(game)}에서 타점이 가장 많은 선수는?`, leaders[0].player, shuffled(game.batters.filter((item) => item !== leaders[0]).map((item) => item.player), random), `${leaders[0].player}이(가) ${topRbi}타점으로 가장 많았다.`);
  }

  if (innings > 9) {
    push('extra-innings', 'hard', `${matchName(game)}은(는) 몇 회까지 치렀나?`, `${innings}회`, [9, 10, 11, 12, 13].filter((value) => value !== innings).map((value) => `${value}회`), `${innings}회까지 간 연장 경기였다.`);
  }

  if (!tie) {
    const winnerSide = winner === home.team ? home : away;
    const top = Math.max(...winnerSide.innings);
    const bigInnings = winnerSide.innings.flatMap((run, index) => (run === top ? [index + 1] : []));
    if (top > 0 && bigInnings.length === 1) {
      const inning = bigInnings[0];
      const wrong = shuffled(Array.from({ length: Math.max(innings, 9) }, (_, index) => index + 1).filter((value) => value !== inning), random).map((value) => `${value}회`);
      push('big-inning', 'hard', `${matchName(game)}에서 ${shortTeam(winner)}이(가) 가장 많은 점수(${top}점)를 낸 회는?`, `${inning}회`, wrong, `${shortTeam(winner)}은(는) ${inning}회에 ${top}점을 냈다.`);
    }
    if (loser === home.team ? home.runs === 0 : away.runs === 0) {
      push('shutout', 'hard', `${matchName(game)}에서 한 점도 내지 못한 팀은?`, loser, [winner, ...otherTeams(game, random, 2)], `${final}로 ${shortTeam(loser)}은(는) 무득점이었다.`);
    }
    if (game.walkOff) {
      push('walk-off', 'hard', `${shortDate(game.date)} 끝내기 승리를 거둔 팀은?`, winner, [loser, ...otherTeams(game, random, 2)], `${shortTeam(winner)}이(가) 홈에서 끝내기로 이겼다.`);
    }
  }
  return out.map((candidate) => ({ ...candidate, source: game.source, recordAsOf: game.date, seasonScope: `${game.date.slice(0, 4)} 시즌` }));
}

/** 문제 수를 50·35·15에 가장 가깝게 나눈다(5문제면 2·2·1). 남는 자리는 어려운 쪽부터 */
export function difficultyPlan(total) {
  const plan = Object.fromEntries(DIFFICULTIES.map((key) => [key, Math.floor(total * RATIO[key] + 1e-9)]));
  let left = total - sum(Object.values(plan));
  const byRemainder = [...DIFFICULTIES].sort((a, b) => {
    const gap = (total * RATIO[b]) % 1 - (total * RATIO[a]) % 1;
    return Math.abs(gap) > 1e-9 ? gap : DIFFICULTIES.indexOf(b) - DIFFICULTIES.indexOf(a);
  });
  for (const key of byRemainder) {
    if (left <= 0) break;
    plan[key] += 1;
    left -= 1;
  }
  return plan;
}

/** 후보에서 고른다. 경기가 고르게 나오게 하고, 어떤 난이도가 모자라면 있는 문항으로 채운다. 지어내지 않는다 */
export function pickQuestions(candidates, total, random) {
  const unique = [];
  const stems = new Set();
  for (const candidate of shuffled(candidates, random)) {
    if (stems.has(candidate.stem)) continue;
    stems.add(candidate.stem);
    unique.push(candidate);
  }
  const plan = difficultyPlan(total);
  const picked = [];
  const useCount = new Map();
  const takeFrom = (pool, count) => {
    for (let taken = 0; taken < count && pool.length > 0; taken += 1) {
      pool.sort((a, b) => (useCount.get(a.gameIds[0]) ?? 0) - (useCount.get(b.gameIds[0]) ?? 0));
      const next = pool.shift();
      useCount.set(next.gameIds[0], (useCount.get(next.gameIds[0]) ?? 0) + 1);
      picked.push(next);
      const index = unique.indexOf(next);
      if (index >= 0) unique.splice(index, 1);
    }
  };
  for (const difficulty of DIFFICULTIES) takeFrom(unique.filter((item) => item.difficulty === difficulty), plan[difficulty]);
  if (picked.length < total) takeFrom([...unique], total - picked.length);
  return picked.sort((a, b) => DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty));
}

const CATEGORY = { winner: 'team-history', 'team-result': 'team-history', 'final-score': 'team-history', shutout: 'team-history', 'walk-off': 'team-history', 'extra-innings': 'team-history', 'big-inning': 'team-history' };

/** 후보를 문서 모양으로. 공개 문항에는 정답을 넣지 않는다 */
export function toDocuments(picked, random) {
  const labels = ['A', 'B', 'C', 'D'];
  return picked.map((item) => {
    const texts = shuffled([item.correct, ...item.wrong], random);
    const options = texts.map((text, index) => ({ label: labels[index], text }));
    return {
      question: {
        stem: item.stem,
        options,
        difficulty: item.difficulty,
        category: CATEGORY[item.type] ?? 'player-stats',
        recordAsOf: item.recordAsOf,
        seasonScope: item.seasonScope,
      },
      key: {
        correct: labels[texts.indexOf(item.correct)],
        explanation: item.explanation,
        sourceName: item.source.name,
        sourceUrl: item.source.url,
        recordAsOf: item.recordAsOf,
        gameIds: item.gameIds,
      },
    };
  });
}

/** 문항 하나의 마지막 확인 — 보기 4개, 겹침 없음, 정답이 보기에 하나 */
export function documentProblem({ question, key }) {
  const texts = question.options.map((option) => option.text);
  if (texts.length !== 4 || new Set(texts).size !== 4 || texts.some((text) => !text)) return '보기가 서로 다른 4개가 아니다';
  if (!question.options.some((option) => option.label === key.correct)) return '정답이 보기에 없다';
  if ('correct' in question) return '공개 문항에 정답이 들어 있다';
  if (!key.sourceName || !key.sourceUrl) return '출처가 없다';
  if (!key.explanation) return '해설이 없다';
  return null;
}

export function generateSet(games, { total = KBO_DEFAULT_TOTAL, seed }) {
  const random = seededRandom(seed);
  const candidates = games.flatMap((game) => candidatesOf(game, random));
  const documents = toDocuments(pickQuestions(candidates, total, random), random);
  const problems = documents.map(documentProblem).filter(Boolean);
  return { documents: documents.filter((item) => !documentProblem(item)), problems };
}

// ── 어댑터 ──────────────────────────────────────────────────────────

/**
 * 어댑터 모양: { name, isTest, fetchDay(date) → { seasonEnded?: boolean, games: 원자료[] } }. 받지 못하면 예외를 던진다.
 * 테스트 데이터 어댑터만 있다. 실제 출처는 이용 권한을 확보한 뒤에 더한다(docs/daily-kbo-quiz/02-data-source-report.md).
 */
export function fixtureAdapter(days) {
  return {
    name: 'fixture',
    isTest: true,
    async fetchDay(date) {
      const day = days[date];
      if (day === 'fail') throw new Error('테스트 데이터: 받지 못함');
      return day ?? { games: [] };
    },
  };
}

// ── 실행 ────────────────────────────────────────────────────────────

/** 대상 경기일 D의 묶음은 다음 날(D+1) 06:00에 열린다. 문서 ID는 여는 날 */
const publishAtOf = (setId) => Timestamp.fromMillis(Date.parse(`${setId}T06:00:00+09:00`));

async function recordRun(db, entry) {
  const ref = db.doc('adminConfig/kboRuns');
  const current = await ref.get();
  const runs = Array.isArray(current.get('runs')) ? current.get('runs') : [];
  await ref.set({ runs: [entry, ...runs].slice(0, RUNS_KEPT), updatedAt: FieldValue.serverTimestamp() });
}

/**
 * 하루치를 돈다. 다시 돌려도 문서 ID가 같아 겹치지 않고, 승인된 묶음은 덮어쓰지 않는다.
 * 실패하면 아무것도 바꾸지 않고 기록만 남긴다 — 이전 묶음이 그대로 남는다.
 */
export async function runKboPipeline({ db, adapter, gamesDate, now = Date.now() }) {
  const date = gamesDate ?? addDays(kstDateOf(now), -1);
  const setId = addDays(date, 1);
  const report = { gamesDate: date, setId, source: adapter.name, status: 'ok', games: 0, usable: 0, pending: 0, corrected: 0, questions: 0, problems: [] };
  const finish = async () => {
    await recordRun(db, { ...report, problems: report.problems.slice(0, 20), at: now });
    return report;
  };

  let fetched;
  try {
    fetched = await adapter.fetchDay(date);
  } catch (error) {
    report.status = 'fetch-failed';
    report.problems.push(`받기 실패: ${error instanceof Error ? error.message : String(error)}`);
    return finish();
  }

  const games = dedupeGames((fetched.games ?? []).map(normalizeGame));
  report.games = games.length;
  const usable = [];
  let cancelled = 0;
  const batch = db.batch();
  const changed = [];
  for (const game of games) {
    const check = checkGame(game, date);
    if (game.status === 'cancelled') cancelled += 1;
    if (check.pending) report.pending += 1;
    if (check.usable) usable.push(game);
    else if (game.status !== 'cancelled') report.problems.push(...check.problems.map((problem) => `${game.gameId || '(ID 없음)'}: ${problem}`));
    if (!game.gameId) continue;
    const ref = db.doc(`kboGames/${game.gameId}`);
    const hash = gameHash(game);
    const before = await ref.get();
    if (before.exists && before.get('hash') === hash && before.get('usable') === check.usable) continue;
    if (before.exists && before.get('usable') === true && before.get('hash') !== hash) changed.push(game.gameId);
    batch.set(ref, { ...game, hash, usable: check.usable, pending: check.pending, problems: check.problems, isTest: adapter.isTest, updatedAt: FieldValue.serverTimestamp() });
  }
  report.usable = usable.length;
  report.corrected = changed.length;
  await batch.commit();

  const setRef = db.doc(`kboSets/${setId}`);
  const existing = await setRef.get();
  const locked = existing.exists && existing.get('state') !== 'draft';
  const base = { gamesDate: date, publishAt: publishAtOf(setId), withdrawn: [], isTest: adapter.isTest, updatedAt: FieldValue.serverTimestamp(), by: `ops:${adapter.name}` };

  // 정정 — 이미 승인된 묶음은 문항을 바꾸지 않고, 그 경기를 쓴 문항만 철회한다
  if (locked && changed.length > 0) {
    const keys = await setRef.collection('keys').get();
    const withdrawn = new Set(existing.get('withdrawn') ?? []);
    for (const item of keys.docs) if ((item.get('gameIds') ?? []).some((id) => changed.includes(id))) withdrawn.add(Number(item.id));
    await setRef.update({ withdrawn: [...withdrawn].sort((a, b) => a - b), updatedAt: FieldValue.serverTimestamp() });
    report.status = 'corrected';
    report.problems.push(`기록이 바뀌어 문항 철회: ${[...withdrawn].join(', ')}`);
    return finish();
  }
  if (locked) {
    report.status = 'already-approved';
    return finish();
  }

  // 경기 없음·우천 취소·시즌 끝 — 문항이 없으니 확인할 것이 없다
  const statusKind = fetched.seasonEnded ? 'season-end' : games.length === 0 ? 'no-game' : cancelled === games.length ? 'rainout' : null;
  if (statusKind) {
    await setRef.set({ ...base, kind: statusKind, questions: [], state: 'approved' });
    report.status = statusKind;
    return finish();
  }

  if (usable.length === 0) {
    report.status = report.pending > 0 ? 'waiting-final' : 'no-usable-games';
    return finish();
  }

  const config = await db.doc('adminConfig/kboQuiz').get();
  const total = Number(config.get('questionCount') ?? KBO_DEFAULT_TOTAL);
  const { documents, problems } = generateSet(usable, { total, seed: `${date}|${usable.map(gameHash).join(',')}` });
  report.problems.push(...problems);
  report.questions = documents.length;
  if (documents.length === 0) {
    report.status = 'no-questions';
    return finish();
  }

  const write = db.batch();
  const oldKeys = await setRef.collection('keys').get();
  for (const item of oldKeys.docs) if (Number(item.id) >= documents.length) write.delete(item.ref);
  write.set(setRef, { ...base, kind: 'quiz', questions: documents.map((item) => item.question), state: 'draft' });
  documents.forEach((item, index) => write.set(setRef.collection('keys').doc(String(index)), item.key));
  await write.commit();
  return finish();
}

// ── 밤 집계·지우기 ──────────────────────────────────────────────────

/** 시도 문서에서 숫자만 뽑는다. 개인을 알아볼 값은 남기지 않는다 */
export function summarizeAttempts({ attempts, correct, withdrawn = [], total, previousUids = new Set(), signedUpUids = new Set() }) {
  const out = {
    views: attempts.length,
    guestViews: 0,
    starts: 0,
    completes: 0,
    signupClicks: 0,
    signupCompletes: 0,
    returned: 0,
    questions: Array.from({ length: total }, (_, index) => ({ index, answered: 0, correct: 0 })),
  };
  for (const { uid, guest, answers, signupClicked } of attempts) {
    const entries = Object.entries(answers ?? {});
    if (guest) out.guestViews += 1;
    if (entries.length > 0) out.starts += 1;
    if (total > 0 && entries.length >= total) out.completes += 1;
    if (signupClicked) out.signupClicks += 1;
    if (guest && signedUpUids.has(uid)) out.signupCompletes += 1;
    if (previousUids.has(uid)) out.returned += 1;
    for (const [index, answer] of entries) {
      const bucket = out.questions[Number(index)];
      if (!bucket || withdrawn.includes(Number(index))) continue;
      bucket.answered += 1;
      if (answer?.choice != null && answer.choice === correct[Number(index)]) bucket.correct += 1;
    }
  }
  return out;
}

/** 닫힌 묶음(그저께 06:00~어제 06:00)을 센다. 읽기: 시도 수 + 정답 수 + 전날 시도 수 */
export async function runKboStats({ db, auth, now = Date.now() }) {
  const setId = addDays(kstDateOf(now), -2);
  const report = { setId, counted: false, attemptsDeleted: 0 };
  const setRef = db.doc(`kboSets/${setId}`);
  const set = await setRef.get();
  if (set.exists && (set.get('questions') ?? []).length > 0) {
    const [attemptDocs, keyDocs, previous] = await Promise.all([
      setRef.collection('attempts').get(),
      setRef.collection('keys').get(),
      db.collection(`kboSets/${addDays(setId, -1)}/attempts`).select().get(),
    ]);
    const attempts = attemptDocs.docs.map((item) => ({ uid: item.id, guest: item.get('guest') === true, answers: item.get('answers'), signupClicked: item.get('signupClickedAt') != null }));
    const signedUpUids = new Set();
    const guests = attempts.filter((item) => item.guest).map((item) => ({ uid: item.uid }));
    for (let start = 0; auth && start < guests.length; start += 100) {
      const { users } = await auth.getUsers(guests.slice(start, start + 100));
      for (const user of users) if (user.providerData.length > 0) signedUpUids.add(user.uid);
    }
    const correct = Object.fromEntries(keyDocs.docs.map((item) => [Number(item.id), item.get('correct')]));
    const summary = summarizeAttempts({
      attempts,
      correct,
      withdrawn: set.get('withdrawn') ?? [],
      total: set.get('questions').length,
      previousUids: new Set(previous.docs.map((item) => item.id)),
      signedUpUids,
    });
    await setRef.collection('stats').doc('summary').set({ ...summary, builtAt: FieldValue.serverTimestamp() });
    report.counted = true;
    report.views = summary.views;
  }

  // 보관 기간이 지난 시도를 지운다. PC가 며칠 꺼져 있었어도 놓치지 않게 일주일 치를 본다
  for (let extra = 0; extra < 7; extra += 1) {
    const old = addDays(kstDateOf(now), -(KBO_ATTEMPT_RETENTION_DAYS + 1 + extra));
    const attempts = db.collection(`kboSets/${old}/attempts`);
    const writer = db.bulkWriter();
    writer.onWriteResult(() => {
      report.attemptsDeleted += 1;
    });
    await db.recursiveDelete(attempts, writer);
  }
  return report;
}

// ── 사람이 쓴 묶음(시즌 돌아보기) 올리기 ──────────────────────────────

/**
 * 공식전 문항 풀과 같은 CSV(ops/official/*.csv — git 밖, 정답 포함)를 "어제의 퀴즈" 묶음 **초안**으로 올린다.
 * 관리자가 관리자 사이트 "어제의 퀴즈"에서 정답·출처를 확인하고 승인해야 열린다. 승인된 묶음은 덮어쓰지 않는다.
 * 문항 확인·보기 섞기는 공식전 풀과 같은 parsePool(앱 문제은행과 같은 본문은 거절 — 정답이 이미 공개됨).
 */
export async function importReviewSet({ db, setId, questions, kind = 'review', replace = false, now = Date.now() }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(setId)) throw new Error('--date=YYYY-MM-DD');
  if (questions.length === 0 || questions.length > 10) throw new Error('문항은 1~10개');
  const ref = db.doc(`kboSets/${setId}`);
  const existing = await ref.get();
  // 승인·보류된 묶음은 덮어쓰지 않는다. --replace는 **아직 공개 전**(공개 시각 전)인 것만 — 이미 누가 풀었을 수 있는 묶음은 바꾸지 않는다
  if (existing.exists && existing.get('state') !== 'draft') {
    const opened = (existing.get('publishAt')?.toMillis?.() ?? 0) <= now;
    if (!replace) return { setId, written: false, reason: `이미 ${existing.get('state')} 상태 — 덮어쓰지 않음(공개 전이면 --replace)` };
    if (opened) return { setId, written: false, reason: '이미 공개 시각이 지난 묶음 — 바꾸지 않음' };
  }
  const batch = db.batch();
  const oldKeys = await ref.collection('keys').get();
  for (const item of oldKeys.docs) if (Number(item.id) >= questions.length) batch.delete(item.ref);
  batch.set(ref, {
    kind,
    gamesDate: '',
    publishAt: Timestamp.fromMillis(Date.parse(`${setId}T06:00:00+09:00`)),
    questions: questions.map((question) => ({
      stem: question.stem,
      options: question.options,
      difficulty: question.difficulty,
      category: question.category,
      recordAsOf: question.recordAsOf,
      seasonScope: question.seasonScope,
    })),
    state: 'draft',
    withdrawn: [],
    isTest: false,
    updatedAt: FieldValue.serverTimestamp(),
    by: 'ops:review',
  });
  questions.forEach((question, index) => {
    const [sourceName, ...rest] = question.source.split(' https://');
    batch.set(ref.collection('keys').doc(String(index)), {
      correct: question.correct,
      explanation: question.explanation,
      sourceName: sourceName.trim(),
      sourceUrl: rest.length > 0 ? `https://${rest.join(' https://')}` : '',
      recordAsOf: question.recordAsOf,
      gameIds: [],
    });
  });
  await batch.commit();
  return { setId, written: true, questions: questions.length, replaced: existing.exists ? `${existing.get('kind')}/${existing.get('state')}` : null, at: now };
}
