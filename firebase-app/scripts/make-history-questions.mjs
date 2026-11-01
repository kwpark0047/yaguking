/**
 * B구간 문항 만들기 — data/facts/kbo-history-b.json(사람이 대조한 사실 표) → data/questions.history-b.csv.
 *
 * 운영자 결정(2026-11-01): 한국시리즈·구단 역사·선수 수상(MVP·신인왕·골든글러브)을 B구간(널리 공표된 역사적 사실)으로 늘린다.
 * 선수별 시즌 수치(C구간 — 기록 DB 사용권 필요)는 쓰지 않는다. 표는 위키백과를 한 건씩 대조해 고쳐 쓴 것이고
 * 이 스크립트는 표를 문항 틀에 넣기만 한다(자동 수집 아님 — KBO_YaguKing_Docs 10 문서 §1.2).
 *
 * - 오답 보기는 같은 해에 있던 구단·다른 해 수상자 등 **실제 이름**에서 고른다(본문 해시로 정해져 다시 돌려도 같다)
 * - 난이도는 문항 틀(우승팀 < 준우승 < MVP < 전적)과 오래된 정도로 점수를 매겨, 문제은행 전체가 쉬움·보통·어려움
 *   500:500:400 비율에 가깝도록 나눈다
 * - 오늘의 공식전 문항 풀(ops/official/pool.csv — 정답이 운영자 PC에만 있다)과 같은 사실은 넣지 않는다(EXCLUDE)
 *
 *   node scripts/make-history-questions.mjs && npm run content:build
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './build-questions.mjs';

const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));
const FACTS = JSON.parse(readFileSync(`${DATA_DIR}facts/kbo-history-b.json`, 'utf8'));
const OUT = `${DATA_DIR}questions.history-b.csv`;
const VERIFIED = FACTS.verifiedAt;
/**
 * 마지막 시즌 = 사실 표의 가장 최근 한국시리즈. 2026 한국시리즈(11-03~11-11)가 끝나면 koreanSeries에
 * [2026, 우승, 전적, 준우승, MVP, "끝난 날 YYYY-MM-DD"] 한 줄만 더하면 "2025 시즌까지" 문항(우승 횟수·최근 우승·진출 횟수·
 * 우승 없는 구단·최다 우승)이 모두 "2026 시즌까지"로 다시 만들어진다. 끝난 날을 적으면 그 문항은 21일 동안 "최신 경기"로 나온다
 */
const LAST_SEASON = Math.max(...FACTS.koreanSeries.map((row) => row[0]));
const RIGHTS =
  'B구간(널리 공표된 역사적 사실) — 위키백과 표를 한 건씩 대조해 고친 사실 표(data/facts/kbo-history-b.json)로 쓴 문항. 기록 데이터 자동 수집 아님, 선수별 시즌 수치 없음. 법적 검토 전 운영자 결정(2026-11-01)';

/**
 * 공식전 풀에 이미 있는 사실 — 앱 문제은행(공개 묶음)에 같은 답이 실리지 않게 뺀다. 본문뿐 아니라 해설에도 답이 드러나므로
 * 그해 한국시리즈 문항 전부, 그 구단의 우승 관련 문항 전부를 뺀다.
 */
const EXCLUDE = [
  /^ks-[a-z]+-(1982|1999|2020|2021|2025)$/,
  /^(mvp|mvpteam)-(1982|2006|2024)$/,
  /^(rookie|rookieteam)-2006$/,
  /^team-(titles|first|last|ksapps)-(hanwha|nc|kt|lotte|kia)$/,
  /^team-(season-nc|season-kt|stadium-kiwoom|stadium-hanwha|firstks-kt)$/,
  /^binggrae-entry$/,
];

// ── 도움 함수 ──────────────────────────────────────────────────────────────

const hash = (text) => createHash('sha256').update(text, 'utf8').digest();

/** 본문에 따라 정해지는 섞기(다시 돌려도 같은 문항) */
function shuffled(items, seed) {
  const digest = hash(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = digest[i % digest.length] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 받침이 있으면 앞, 없으면 뒤(이/가, 을/를, 은/는, 와/과) */
function josa(word, withBatchim, without) {
  const last = [...word.replace(/[^가-힣A-Za-z0-9]+$/, '')].pop() ?? '';
  const code = last.charCodeAt(0);
  let batchim = false;
  if (code >= 0xac00 && code <= 0xd7a3) batchim = (code - 0xac00) % 28 !== 0;
  else if (/[0-9]/.test(last)) batchim = '013678'.includes(last);
  else if (/[A-Za-z]/.test(last)) batchim = /[LMNR]/i.test(last);
  return `${word}${batchim ? withBatchim : without}`;
}

const nameIn = (franchise, year) => franchise.names.find(([, from, to]) => from <= year && (to ?? 9999) >= year)?.[0] ?? null;
const teamsIn = (year) => FACTS.franchises.map((franchise) => nameIn(franchise, year)).filter(Boolean);
const franchiseOf = (teamName) => FACTS.franchises.find((franchise) => franchise.names.some(([name]) => name === teamName));
const current = FACTS.franchises.filter((franchise) => !franchise.defunct);
const currentName = (franchise) => franchise.names.at(-1)[0];

/** 정답 + 오답 후보에서 서로 다른 3개 → 보기 4개(정답 위치는 build-questions가 다시 섞는다) */
function options(correct, pool, seed) {
  const wrong = shuffled([...new Set(pool.filter((item) => item !== correct))], seed).slice(0, 3);
  if (wrong.length < 3) throw new Error(`오답 보기가 모자람: ${seed}`);
  return [correct, ...wrong];
}

/** 가까운 해의 값 7개를 오답 후보로(너무 먼 해의 이름은 보기만 봐도 걸러져서) */
function nearby(rows, year, pick, exclude) {
  const values = [...rows]
    .sort((a, b) => Math.abs(a[0] - year) - Math.abs(b[0] - year))
    .map(pick)
    .filter((value) => !exclude.includes(value));
  return [...new Set(values)].slice(0, 7);
}

const questions = [];
function addQuestion({ key, category, score, stem, answer, pool, explanation, source, year = null, scope = null, asOf = null }) {
  if (EXCLUDE.some((pattern) => pattern.test(key))) return;
  const opts = options(answer, pool, stem);
  questions.push({
    key,
    category,
    score: score + (year ? age(year) : 0), // 같은 틀이면 오래된 해일수록 어렵다
    stem,
    explanation,
    opts,
    source: FACTS.sources[source],
    recordAsOf: asOf ?? `${year ?? LAST_SEASON}-12-31`,
    eraYear: year ?? '',
    scope: scope ?? (year ? `${year} 시즌` : `${LAST_SEASON} 시즌까지`),
  });
}
const add = addQuestion;

/** 오래될수록 어렵다: 2025 → 0, 1982 → 약 3.6 */
const age = (year) => (LAST_SEASON - year) / 12;

// ── 한국시리즈 ─────────────────────────────────────────────────────────────

const KS = FACTS.koreanSeries;
const RESULTS = ['4승 0패', '4승 1패', '4승 2패', '4승 3패', '4승 1무 1패', '4승 1무 2패', '4승 1무', '4승 3무 2패'];
const ksMvps = KS.map((row) => row[4]);
for (const [year, winner, result, runnerUp, mvp, endedOn] of KS) {
  const teams = teamsIn(year);
  // 끝난 날이 적힌 해(새로 더한 한국시리즈)는 그날을 기준일로 — "최신 경기"로 나온다
  const add = (question) => addQuestion({ ...question, asOf: endedOn ?? null });
  const summary = `${year} 한국시리즈에서 ${josa(winner, '이', '가')} ${josa(runnerUp, '을', '를')} ${result}로 꺾고 우승했다. MVP는 ${mvp}.`;
  add({ key: `ks-winner-${year}`, category: 'korean-series', score: 1, year, source: 'ks',
    stem: `${year}년 한국시리즈에서 우승한 팀은?`, answer: winner, pool: teams.filter((team) => team !== runnerUp), explanation: summary });
  add({ key: `ks-runner-${year}`, category: 'korean-series', score: 2, year, source: 'ks',
    stem: `${year}년 한국시리즈에서 ${winner}에 져 준우승한 팀은?`, answer: runnerUp, pool: teams.filter((team) => team !== winner), explanation: summary });
  add({ key: `ks-mvp-${year}`, category: 'korean-series', score: 2.6, year, source: 'ks',
    stem: `${year}년 한국시리즈 MVP는?`, answer: mvp, pool: nearby(KS, year, (row) => row[4], [mvp]), explanation: summary });
  add({ key: `ks-result-${year}`, category: 'korean-series', score: 3.6, year, source: 'ks',
    stem: `${year}년 한국시리즈에서 우승한 ${winner}의 시리즈 전적은?`, answer: result, pool: RESULTS, explanation: summary });
  // 한 번만 MVP에 오른 선수 → 그해를 묻는다
  if (ksMvps.filter((name) => name === mvp).length === 1) {
    add({ key: `ks-mvpyear-${year}`, category: 'korean-series', score: 3, year, source: 'ks',
      stem: `${winner}의 ${josa(mvp, '이', '가')} 한국시리즈 MVP에 오른 해는?`,
      answer: `${year}년`, pool: [year - 3, year - 2, year - 1, year + 1, year + 2, year + 3].filter((y) => y >= 1982 && y <= LAST_SEASON && y !== 1985).map((y) => `${y}년`),
      explanation: summary });
  }
}
add({ key: 'ks-1985', category: 'korean-series', score: 3.5, year: 1985, source: 'ks',
  stem: '한국시리즈가 열리지 않은 유일한 해(전·후기 통합 우승)는?', answer: '1985년', pool: ['1983년', '1984년', '1986년', '1987년'],
  explanation: '1985년에는 삼성 라이온즈가 전기·후기 리그를 모두 1위로 마쳐 한국시리즈 없이 통합 우승했다.' });
add({ key: 'ks-1985-team', category: 'korean-series', score: 3.2, year: 1985, source: 'ks',
  stem: '1985년 전·후기 통합 우승으로 한국시리즈 없이 정상에 오른 팀은?', answer: '삼성 라이온즈', pool: teamsIn(1985),
  explanation: '1985년에는 삼성 라이온즈가 전기·후기 리그를 모두 1위로 마쳐 한국시리즈가 열리지 않았다.' });
const sweeps = KS.filter((row) => row[2] === '4승 0패');
for (const [year, winner, , runnerUp] of sweeps) {
  add({ key: `ks-sweep-${year}`, category: 'korean-series', score: 3.4, year, source: 'ks',
    stem: `${year}년 한국시리즈에서 ${josa(runnerUp, '을', '를')} 4전 전승으로 꺾은 팀은?`, answer: winner, pool: teamsIn(year).filter((team) => team !== runnerUp),
    explanation: `${year} 한국시리즈는 ${josa(winner, '이', '가')} 한 경기도 내주지 않고 4승 0패로 끝냈다.` });
}

// ── 구단 역사 ──────────────────────────────────────────────────────────────

const titlesOf = (franchise) => KS.filter(([, winner]) => franchiseOf(winner) === franchise).map(([year]) => year);
const appearancesOf = (franchise) => KS.filter(([, winner, , runnerUp]) => franchiseOf(winner) === franchise || franchiseOf(runnerUp) === franchise).map(([year]) => year);
const CITIES = ['서울', '부산', '대구', '광주', '대전', '인천', '수원', '창원', '전주'];
const STADIUMS = [...new Set(current.map((franchise) => franchise.stadium))];
const teamSource = 'teams';
for (const franchise of current) {
  const name = currentName(franchise);
  add({ key: `team-city-${franchise.id}`, category: 'team-history', score: 0.2, source: teamSource,
    stem: `${name}의 연고지(홈 도시)는?`, answer: franchise.city, pool: CITIES, explanation: `${josa(name, '은', '는')} ${josa(franchise.city, '을', '를')} 연고로 한다.` });
  add({ key: `team-stadium-${franchise.id}`, category: 'team-history', score: 1.3, source: teamSource,
    stem: `${name}의 지금 홈구장은?`, answer: franchise.stadium, pool: STADIUMS.filter((stadium) => stadium !== franchise.stadium),
    explanation: `${name}의 홈구장은 ${josa(franchise.stadium, '이다', '다')}(${LAST_SEASON} 시즌 기준).` });
  add({ key: `team-season-${franchise.id}`, category: 'team-history', score: 2.8, source: teamSource,
    stem: `전신을 포함해 ${josa(name, '이', '가')} KBO 1군 정규시즌에 처음 참가한 해는?`,
    answer: `${franchise.firstSeason}년`, pool: ['1982년', '1986년', '1991년', '2000년', '2008년', '2013년', '2015년'],
    explanation: `${josa(name, '은', '는')} 전신을 포함해 ${franchise.firstSeason}년 1군 정규시즌에 처음 나섰다.` });
  const titles = titlesOf(franchise);
  add({ key: `team-titles-${franchise.id}`, category: 'team-history', score: 3.2, source: teamSource,
    stem: `${LAST_SEASON} 시즌까지 ${name}(전신 포함)의 한국시리즈 우승 횟수는?`, answer: `${titles.length}회`,
    pool: [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12].map((count) => `${count}회`),
    explanation: titles.length ? `${LAST_SEASON} 시즌까지 ${titles.length}회 우승: ${titles.join('·')}년.` : `${LAST_SEASON} 시즌까지 한국시리즈 우승이 없다.` });
  if (titles.length > 0) {
    const years = KS.map(([year]) => `${year}년`);
    add({ key: `team-first-${franchise.id}`, category: 'team-history', score: 2.4, year: titles[0], source: teamSource,
      stem: `전신을 포함해 ${josa(name, '이', '가')} 처음 한국시리즈에서 우승한 해는?`, answer: `${titles[0]}년`,
      pool: nearby(KS, titles[0], ([year]) => `${year}년`, titles.map((year) => `${year}년`)).filter((year) => years.includes(year)),
      explanation: `${name}(전신 포함)의 한국시리즈 우승: ${titles.join('·')}년.` });
    if (titles.length > 1) {
      const last = titles.at(-1);
      add({ key: `team-last-${franchise.id}`, category: 'team-history', score: 1.8 + age(last) / 2, source: teamSource,
        stem: `${LAST_SEASON} 시즌까지 ${name}(전신 포함)의 가장 최근 한국시리즈 우승은?`, answer: `${last}년`,
        pool: nearby(KS, last, ([year]) => `${year}년`, titles.map((year) => `${year}년`)),
        explanation: `${name}(전신 포함)의 한국시리즈 우승: ${titles.join('·')}년.` });
    }
  }
  const appearances = appearancesOf(franchise);
  if (appearances.length > 0) {
    add({ key: `team-firstks-${franchise.id}`, category: 'team-history', score: 3, year: appearances[0], source: teamSource,
      stem: `전신을 포함해 ${josa(name, '이', '가')} 처음 한국시리즈 무대를 밟은 해는?`, answer: `${appearances[0]}년`,
      pool: nearby(KS, appearances[0], ([year]) => `${year}년`, [`${appearances[0]}년`]),
      explanation: `${name}(전신 포함)의 첫 한국시리즈는 ${appearances[0]}년이다.` });
    add({ key: `team-ksapps-${franchise.id}`, category: 'team-history', score: 4.2, source: teamSource,
      stem: `${LAST_SEASON} 시즌까지 전신을 포함해 ${josa(name, '이', '가')} 한국시리즈에 나간 횟수는?`, answer: `${appearances.length}회`,
      pool: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].filter((n) => Math.abs(n - appearances.length) <= 4).map((n) => `${n}회`),
      explanation: `${LAST_SEASON} 시즌까지 한국시리즈에 ${appearances.length}번 나갔다: ${appearances.join('·')}년.` });
  }
}
const uniqueCity = current.filter((franchise) => current.filter((other) => other.city === franchise.city).length === 1);
for (const franchise of uniqueCity) {
  add({ key: `city-team-${franchise.id}`, category: 'team-history', score: 0.4, source: teamSource,
    stem: `${josa(franchise.city, '을', '를')} 연고로 하는 KBO 구단은?`, answer: currentName(franchise),
    pool: current.filter((other) => other !== franchise).map(currentName), explanation: `${currentName(franchise)}의 연고지는 ${franchise.city}다.` });
}
const seoul = current.filter((franchise) => franchise.city === '서울').map(currentName);
add({ key: 'city-seoul-not', category: 'team-history', score: 0.9, source: teamSource,
  stem: '다음 중 서울을 연고로 하지 않는 구단은?', answer: '롯데 자이언츠', pool: [...seoul, ...seoul],
  explanation: `서울 연고 구단은 ${seoul.join('·')}다. 롯데 자이언츠는 부산 연고.` });
add({ key: 'jamsil-share', category: 'team-history', score: 1.1, source: teamSource,
  stem: '잠실야구장을 함께 홈구장으로 쓰는 두 구단은?', answer: 'LG 트윈스·두산 베어스',
  pool: ['LG 트윈스·키움 히어로즈', '두산 베어스·키움 히어로즈', 'LG 트윈스·SSG 랜더스'], explanation: 'LG 트윈스와 두산 베어스가 잠실야구장을 함께 쓴다.' });
// 우승 없는 구단·최다 우승 구단은 표에서 센다(답이 하나일 때만 낸다)
const titleCounts = current.map((franchise) => ({ name: currentName(franchise), count: titlesOf(franchise).length }));
const noTitle = titleCounts.filter((team) => team.count === 0);
if (noTitle.length === 1) {
  add({ key: 'no-title', category: 'team-history', score: 1.6, source: teamSource,
    stem: `${LAST_SEASON} 시즌까지 한국시리즈 우승이 한 번도 없는 지금 구단은?`, answer: noTitle[0].name,
    pool: titleCounts.filter((team) => team.count > 0 && team.count <= 2).map((team) => team.name),
    explanation: `${LAST_SEASON} 시즌까지 10개 구단 가운데 ${noTitle[0].name}만 한국시리즈 우승이 없다.` });
}
const most = Math.max(...titleCounts.map((team) => team.count));
const mostTeams = titleCounts.filter((team) => team.count === most);
if (mostTeams.length === 1) {
  add({ key: 'most-titles', category: 'team-history', score: 0.8, source: teamSource,
    stem: `${LAST_SEASON} 시즌까지 한국시리즈 우승이 가장 많은 구단(전신 포함)은?`, answer: mostTeams[0].name,
    pool: [...titleCounts].sort((a, b) => b.count - a.count).slice(1, 5).map((team) => team.name),
    explanation: `${LAST_SEASON} 시즌까지 ${mostTeams[0].name}(전신 포함)가 ${most}번으로 가장 많이 우승했다.` });
}
const hyundai = FACTS.franchises.find((franchise) => franchise.id === 'hyundai');
const hyundaiTitles = titlesOf(hyundai);
add({ key: 'hyundai-last', category: 'team-history', score: 3.3, year: 2007, source: teamSource,
  stem: '현대 유니콘스가 마지막으로 정규시즌을 치른 해는?', answer: '2007년', pool: ['2004년', '2005년', '2006년', '2008년', '2009년'],
  explanation: '현대 유니콘스는 2007 시즌을 끝으로 해체했다.' });
add({ key: 'hyundai-titles', category: 'team-history', score: 3.4, year: 2007, source: teamSource,
  stem: '현대 유니콘스의 한국시리즈 우승 횟수는?', answer: `${hyundaiTitles.length}회`, pool: ['1회', '2회', '3회', '5회', '6회'],
  explanation: `현대 유니콘스는 ${hyundaiTitles.join('·')}년 한국시리즈에서 우승했다.` });
add({ key: 'hyundai-first', category: 'team-history', score: 3.0, year: 1998, source: teamSource,
  stem: '현대 유니콘스가 처음 한국시리즈에서 우승한 해는?', answer: '1998년', pool: ['1996년', '1997년', '1999년', '2000년'],
  explanation: `현대 유니콘스의 한국시리즈 우승: ${hyundaiTitles.join('·')}년.` });
add({ key: 'sammi-city', category: 'team-history', score: 3.1, year: 1982, source: teamSource,
  stem: '1982년 원년 구단 삼미 슈퍼스타즈의 연고지는?', answer: '인천', pool: CITIES, explanation: '삼미 슈퍼스타즈는 인천을 연고로 했다(뒤에 청보·태평양·현대로 이어짐).' });
add({ key: 'pintos', category: 'team-history', score: 3.7, year: 1985, source: teamSource,
  stem: '삼미 슈퍼스타즈를 이어 1985년부터 1987년까지 뛴 인천 구단은?', answer: '청보 핀토스', pool: ['태평양 돌핀스', '현대 유니콘스', '빙그레 이글스', 'MBC 청룡'],
  explanation: '인천 구단은 삼미 슈퍼스타즈 → 청보 핀토스(1985~1987) → 태평양 돌핀스(1988~1995) → 현대 유니콘스로 이어졌다.' });
add({ key: 'dolphins', category: 'team-history', score: 3.5, year: 1988, source: teamSource,
  stem: '1988년부터 1995년까지 인천을 연고로 뛴 구단은?', answer: '태평양 돌핀스', pool: ['청보 핀토스', '삼미 슈퍼스타즈', 'SK 와이번스', '쌍방울 레이더스'],
  explanation: '태평양 돌핀스(1988~1995)는 1996년 현대 유니콘스가 이어받았다.' });
add({ key: 'unicorns', category: 'team-history', score: 3.2, year: 1996, source: teamSource,
  stem: '태평양 돌핀스를 이어 1996년부터 뛴 구단은?', answer: '현대 유니콘스', pool: ['SK 와이번스', '청보 핀토스', '쌍방울 레이더스', '한화 이글스'],
  explanation: '현대 유니콘스는 1996년부터 2007년까지 뛰었다.' });
add({ key: 'ssangbangwool-city', category: 'team-history', score: 2.9, year: 1991, source: teamSource,
  stem: '쌍방울 레이더스의 연고지는?', answer: '전주', pool: CITIES, explanation: '쌍방울 레이더스는 전주를 연고로 1991년부터 1999년까지 1군에서 뛰었다.' });
add({ key: 'ssangbangwool-first', category: 'team-history', score: 3.6, year: 1991, source: teamSource,
  stem: '쌍방울 레이더스가 1군 정규시즌에 처음 나선 해는?', answer: '1991년', pool: ['1986년', '1988년', '1990년', '1993년'],
  explanation: '쌍방울 레이더스는 1990년 2군을 거쳐 1991년 1군에 합류했다.' });
add({ key: 'ssangbangwool-last', category: 'team-history', score: 3.8, year: 1999, source: teamSource,
  stem: '쌍방울 레이더스가 마지막으로 1군 정규시즌을 치른 해는?', answer: '1999년', pool: ['1996년', '1997년', '1998년', '2000년'],
  explanation: '쌍방울 레이더스는 1999 시즌을 끝으로 해체했고, 2000년 SK 와이번스가 창단했다.' });
add({ key: 'binggrae-entry', category: 'team-history', score: 2.6, year: 1986, source: teamSource,
  stem: '1986년 KBO 리그에 7번째 구단으로 합류한 팀은?', answer: '빙그레 이글스', pool: ['쌍방울 레이더스', '청보 핀토스', '태평양 돌핀스', 'MBC 청룡'],
  explanation: '빙그레 이글스(지금의 한화 이글스)가 1986년 7번째 구단으로 합류했다.' });
add({ key: 'eighth', category: 'team-history', score: 3.0, year: 1991, source: teamSource,
  stem: '1991년 1군에 합류해 KBO 리그 8구단 시대를 연 팀은?', answer: '쌍방울 레이더스', pool: ['빙그레 이글스', 'SK 와이번스', '현대 유니콘스', 'NC 다이노스'],
  explanation: '쌍방울 레이더스가 1991년 1군에 합류해 8개 구단이 됐다.' });
add({ key: 'sk-entry', category: 'team-history', score: 2.4, year: 2000, source: teamSource,
  stem: '2000년 창단해 인천을 연고로 1군에 합류한 구단은?', answer: 'SK 와이번스', pool: ['현대 유니콘스', '넥센 히어로즈', '태평양 돌핀스', 'SSG 랜더스'],
  explanation: 'SK 와이번스는 2000년 창단해 인천을 연고로 뛰었다(2021년부터 SSG 랜더스).' });
add({ key: 'heroes-entry', category: 'team-history', score: 2.5, year: 2008, source: teamSource,
  stem: '2008년 창단해 1군에 합류한 서울 구단은?', answer: '히어로즈(지금의 키움 히어로즈)', pool: ['LG 트윈스', '두산 베어스', 'SK 와이번스', 'NC 다이노스'],
  explanation: '2008년 창단한 히어로즈는 우리·넥센을 거쳐 지금의 키움 히어로즈가 됐다.' });
add({ key: 'two-leagues', category: 'team-history', score: 3.4, year: 1999, source: 'teams',
  stem: '1999~2000년 KBO가 나눠 치른 두 리그의 이름은?', answer: '드림 리그·매직 리그', pool: ['동부 리그·서부 리그', '북부 리그·남부 리그', '나눔 리그·드림 리그'],
  explanation: 'KBO는 1999~2000년 드림 리그와 매직 리그로 나눠 정규시즌을 치렀다.' });
for (const [year, winner] of KS) {
  const franchise = franchiseOf(winner);
  // OB 베어스는 1982~1984년 대전, 현대 유니콘스는 2000년부터 수원(임시) — 연고지가 지금과 달라 묻지 않는다
  if (!franchise || (franchise.id === 'doosan' && year <= 1984) || (franchise.id === 'hyundai' && year >= 2000)) continue;
  add({ key: `ks-city-${year}`, category: 'team-history', score: 2.2, year, source: teamSource,
    stem: `${year}년 한국시리즈 우승팀의 연고지는?`, answer: franchise.city,
    pool: CITIES.slice(0, 8), explanation: `${year} 한국시리즈 우승팀은 ${winner}(${franchise.city}).` });
}

// ── 선수 수상 ──────────────────────────────────────────────────────────────

const MVP = FACTS.mvp;
for (const [year, name, team, position] of MVP) {
  add({ key: `mvp-${year}`, category: 'player-stats', score: 1.2, year, source: 'mvp',
    stem: `${year}년 KBO 정규시즌 MVP는?`, answer: name, pool: nearby(MVP, year, (row) => row[1], [name]),
    explanation: `${year} 정규시즌 MVP는 ${name}(${team}, ${position}).` });
  add({ key: `mvpteam-${year}`, category: 'player-stats', score: 2, year, source: 'mvp',
    stem: `${year}년 정규시즌 MVP ${name}의 그해 소속팀은?`, answer: team, pool: teamsIn(year),
    explanation: `${year} 정규시즌 MVP ${josa(name, '은', '는')} ${team} 소속이었다.` });
}
add({ key: 'mvp-most', category: 'player-stats', score: 1.4, source: 'mvp',
  stem: `${LAST_SEASON} 시즌까지 정규시즌 MVP를 가장 많이 받은 선수는?`, answer: '이승엽', pool: ['선동열', '박병호', '장종훈', '김성한'],
  explanation: '이승엽이 1997·1999·2001·2002·2003년 다섯 번 받았다.' });
add({ key: 'mvp-sun', category: 'player-stats', score: 3.0, year: 1990, source: 'mvp',
  stem: '정규시즌 MVP를 세 번(1986·1989·1990년) 받은 해태 타이거즈 투수는?', answer: '선동열', pool: ['이강철', '김정수', '조계현', '문희수'],
  explanation: '선동열은 1986·1989·1990년 정규시즌 MVP에 올랐다.' });
add({ key: 'mvp-foreign-first', category: 'player-stats', score: 2.8, year: 1998, source: 'mvp',
  stem: '외국인 선수로 처음 정규시즌 MVP를 받은 선수(1998년)는?', answer: '타이론 우즈', pool: ['톰 퀸란', '다니엘 리오스', '에릭 테임즈', '더스틴 니퍼트'],
  explanation: '1998년 OB 베어스의 타이론 우즈가 외국인 선수 첫 정규시즌 MVP가 됐다.' });
add({ key: 'mvp-back-to-back-park', category: 'player-stats', score: 2.0, year: 2013, source: 'mvp',
  stem: '2012·2013년 두 해 연속 정규시즌 MVP를 받은 넥센 히어로즈 타자는?', answer: '박병호', pool: ['서건창', '강정호', '이택근', '김민성'],
  explanation: '박병호가 2012·2013년 연속 정규시즌 MVP에 올랐다.' });

const ROOKIE = FACTS.rookie;
for (const [year, name, team, position] of ROOKIE) {
  add({ key: `rookie-${year}`, category: 'player-stats', score: 2.2, year, source: 'rookie',
    stem: `${year}년 KBO 신인왕은?`, answer: name, pool: nearby(ROOKIE, year, (row) => row[1], [name]),
    explanation: `${year} 신인왕은 ${name}(${team}, ${position}).` });
  add({ key: `rookieteam-${year}`, category: 'player-stats', score: 2.6, year, source: 'rookie',
    stem: `${year}년 신인왕 ${name}의 그해 소속팀은?`, answer: team, pool: teamsIn(year),
    explanation: `${year} 신인왕 ${josa(name, '은', '는')} ${team} 소속이었다.` });
}
add({ key: 'rookie-and-mvp', category: 'player-stats', score: 2.4, year: 2012, source: 'mvp',
  stem: '신인왕(2012년)과 정규시즌 MVP(2014년)를 모두 받은 넥센 히어로즈 선수는?', answer: '서건창', pool: ['박병호', '강정호', '이정후', '김하성'],
  explanation: '서건창은 2012년 신인왕, 2014년 정규시즌 MVP를 받았다.' });
add({ key: 'rookie-and-mvp-lee', category: 'player-stats', score: 1.6, year: 2022, source: 'mvp',
  stem: '2017년 신인왕에 이어 2022년 정규시즌 MVP에 오른 선수는?', answer: '이정후', pool: ['강백호', '김하성', '구자욱', '김혜성'],
  explanation: '이정후는 2017년 신인왕(넥센 히어로즈), 2022년 정규시즌 MVP(키움 히어로즈)를 받았다.' });

const GG = FACTS.goldenGlove;
const ggYears = Object.keys(GG.years).map(Number).sort();
const ggAll = ggYears.flatMap((year) => GG.years[year].flat());
for (const year of ggYears) {
  const row = GG.years[year];
  GG.positions.forEach((position, index) => {
    if (position === '외야수') {
      const outfield = row[index];
      const others = ggYears.flatMap((y) => GG.years[y][index]).filter((name) => !outfield.includes(name));
      add({ key: `gg-of-${year}`, category: 'player-stats', score: 2.6, year, source: 'gg',
        stem: `다음 중 ${year}년 KBO 골든글러브 외야수 부문 수상자는?`, answer: outfield[0], pool: [...others, ...ggAll.filter((name) => !outfield.includes(name))],
        explanation: `${year} 골든글러브 외야수: ${outfield.join('·')}.` });
      add({ key: `gg-ofnot-${year}`, category: 'player-stats', score: 3.2, year, source: 'gg',
        stem: `다음 중 ${year}년 KBO 골든글러브 외야수 부문 수상자가 아닌 선수는?`, answer: shuffled(ggYears.filter((y) => Math.abs(y - year) <= 3 && y !== year).flatMap((y) => GG.years[y][index]).filter((name) => !outfield.includes(name)), String(year))[0],
        pool: outfield, explanation: `${year} 골든글러브 외야수: ${outfield.join('·')}.` });
      return;
    }
    const name = row[index];
    const samePosition = ggYears.map((y) => GG.years[y][index]).filter((other) => other !== name);
    add({ key: `gg-${index}-${year}`, category: 'player-stats', score: 2.5, year, source: 'gg',
      stem: `${year}년 KBO 골든글러브 ${position} 부문 수상자는?`, answer: name, pool: [...new Set([...samePosition, ...ggAll])].filter((other) => other !== name).slice(0, 8),
      explanation: `${year} 골든글러브 ${position} 부문은 ${name}.` });
  });
}

// ── 난이도 나누기 — 문제은행 전체가 500:500:400에 가깝게 ───────────────────

function existingCounts() {
  const counts = { easy: 0, normal: 0, hard: 0 };
  for (const file of readdirSync(DATA_DIR).filter((name) => /^questions\..+\.csv$/.test(name) && name !== 'questions.history-b.csv')) {
    const [header, ...rows] = parseCsv(readFileSync(DATA_DIR + file, 'utf8'));
    const column = header.indexOf('difficulty');
    for (const row of rows) if (row[column] in counts) counts[row[column]] += 1;
  }
  return counts;
}
const before = existingCounts();
const total = before.easy + before.normal + before.hard + questions.length;
const wantEasy = Math.max(0, Math.round((total * 5) / 14) - before.easy);
const wantNormal = Math.max(0, Math.round((total * 5) / 14) - before.normal);
const sorted = [...questions].sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
sorted.forEach((question, index) => {
  question.difficulty = index < wantEasy ? 'easy' : index < wantEasy + wantNormal ? 'normal' : 'hard';
});

// ── CSV 쓰기 ───────────────────────────────────────────────────────────────

const HEADER = ['category_slug', 'difficulty', 'record_as_of', 'era_year', 'season_scope', 'stem', 'explanation', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_label', 'source_name', 'source_url', 'verified_at', 'rights_note'];
const cell = (value) => (/[",\n]/.test(String(value)) ? `"${String(value).replaceAll('"', '""')}"` : String(value));
const lines = [HEADER.join(',')];
const stems = new Set();
for (const question of questions) {
  if (stems.has(question.stem)) throw new Error(`본문이 겹침: ${question.stem}`);
  stems.add(question.stem);
  if (question.opts.some((text) => !text) || new Set(question.opts).size !== 4) throw new Error(`보기 오류: ${question.stem}`);
  lines.push([
    question.category, question.difficulty, question.recordAsOf, question.eraYear, question.scope, question.stem, question.explanation,
    ...question.opts, 'A', question.source.name, question.source.url, VERIFIED, RIGHTS,
  ].map(cell).join(','));
}
writeFileSync(OUT, `${lines.join('\n')}\n`);

const by = (field) => questions.reduce((acc, question) => ({ ...acc, [question[field]]: (acc[question[field]] ?? 0) + 1 }), {});
console.log(`${questions.length}문항 → data/questions.history-b.csv`, by('category'), by('difficulty'));
console.log('문제은행 전체 난이도', { easy: before.easy + (by('difficulty').easy ?? 0), normal: before.normal + (by('difficulty').normal ?? 0), hard: before.hard + (by('difficulty').hard ?? 0) });
