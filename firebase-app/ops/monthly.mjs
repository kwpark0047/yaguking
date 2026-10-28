/**
 * 월간 등수(docs/engagement-plan.md §4) — 운영자 PC 매일 작업(ops/run-cleanup.cmd → admin-cli monthly).
 *
 * - 이번 달 출석 문서(users/{uid}/attendance/{YYYYMM})로 출석 포인트를 다시 계산하고, 오늘의 공식전 점수
 *   (users/{uid}/officialMonth/{YYYYMM} — ops/official.mjs가 판정해 쓴 값)를 더해 leaderboards/{YYYYMM} **문서 하나**에 쓴다
 *   (상위 50·참여 인원·포인트별 인원 분포). 화면은 이 문서 하나만 읽는다. uid는 leaderboardKeys/{YYYYMM}(규칙상 아무도 못 읽음)에만
 * - "어제까지" 센다(오늘 찍은 도장은 다음 날 반영). 다음 달 첫 실행이 지난달을 **확정**하고 칭호(users/{uid}/awards/{YYYYMM})를 준다
 * - 확정된 달은 다시 쓰지 않는다. 다만 탈퇴한 회원은 매일 지운다("탈퇴한 선수"). 12달이 지난 등수는 지운다
 * - 실행을 빠뜨린 날이 있어도 처음부터 다시 계산하므로 다음 실행이 따라잡는다
 *
 * 포인트 계산은 src/lib/game/attendance.ts와 같아야 한다(tests/unit/attendance.test.ts가 대조).
 */
import { FieldValue } from 'firebase-admin/firestore';

export const ENGAGEMENT_START = '2026-11-05';
export const POINTS = { day: 10, week: 30, perfect: 100 };
export const DOUBLE_FACTOR = 2;
export const TEAM_MIN_FANS = 3;
export const STREAK_WEEK = 7;
export const RANKING_TOP = 50;
export const HIDDEN_NAME = '익명 선수';
export const REMOVED_NAME = '탈퇴한 선수';
export const LEADERBOARD_MONTHS_KEPT = 12;

const KST = 9 * 3_600_000;

export function kstMonthKey(ms) {
  const date = new Date(ms + KST);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(month) {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(4, 6)), 0)).getUTCDate();
}

export function previousMonth(month) {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(4, 6)) - 1;
  return index === 0 ? `${year - 1}12` : `${year}${String(index).padStart(2, '0')}`;
}

const startMonthOf = (start) => start.slice(0, 4) + start.slice(5, 7);

export function firstCountedDay(month, start = ENGAGEMENT_START) {
  if (month < startMonthOf(start)) return Number.POSITIVE_INFINITY;
  return month === startMonthOf(start) ? Number(start.slice(8, 10)) : 1;
}

/** 하루 10(2배 날 20), 그 달 안에서 7일 연속마다 +30, 개근 +100(그 달을 다 셌을 때만) — attendance.ts와 같다 */
export function attendancePoints(days, month, through = daysInMonth(month), start = ENGAGEMENT_START, doubleDays = []) {
  const first = firstCountedDay(month, start);
  const last = Math.min(through, daysInMonth(month));
  const counted = [...new Set(days)].filter((day) => Number.isInteger(day) && day >= first && day <= last).sort((a, b) => a - b);
  let weeks = 0;
  let run = 0;
  counted.forEach((day, index) => {
    run = index > 0 && counted[index - 1] === day - 1 ? run + 1 : 1;
    if (run % STREAK_WEEK === 0) weeks += 1;
  });
  const monthDone = last === daysInMonth(month);
  const perfect = monthDone && counted.length > 0 && counted.length === last - first + 1;
  const doubled = counted.filter((day) => doubleDays.includes(day)).length;
  return {
    points: (counted.length + doubled * (DOUBLE_FACTOR - 1)) * POINTS.day + weeks * POINTS.week + (perfect ? POINTS.perfect : 0),
    days: counted.length,
    weeks,
    perfect,
  };
}

export function titlesFor(rank, perfect) {
  const titles = [];
  if (rank === 1) titles.push('king');
  else if (rank <= 3) titles.push('allstar');
  else if (rank <= 10) titles.push('hall');
  if (perfect) titles.push('perfect');
  return titles;
}

/**
 * 순위 매기기 — 포인트 높은 순, 같으면 같은 순위(1, 1, 3 …). 같은 포인트 안에서는 출석일 많은 순, 그다음 닉네임 순으로
 * 늘어놓기만 한다(순위 숫자는 같다). 0점은 빠진다.
 */
export function rankRows(rows) {
  const sorted = rows
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points || b.days - a.days || a.nickname.localeCompare(b.nickname, 'ko'));
  let rank = 0;
  return sorted.map((row, index) => {
    if (index === 0 || sorted[index - 1].points !== row.points) rank = index + 1;
    return { ...row, rank };
  });
}

/** 그 달 공식 점수 합 — official.ts officialSum과 같다 */
export function officialSum(days, month, through = 31) {
  let points = 0;
  let rounds = 0;
  for (const [day, value] of Object.entries(days ?? {})) {
    if (day.slice(0, 6) !== month || Number(day.slice(6, 8)) > through || !Number.isFinite(value)) continue;
    points += value;
    rounds += 1;
  }
  return { points, rounds };
}

/**
 * 구단 대항전 — 최애 구단 1위별 출석 일수·포인트 합. 출석한 팬이 TEAM_MIN_FANS명 이상인 구단만(숨김을 고른 회원도 합에는 든다 —
 * 합만 보이고 누구인지는 보이지 않는다). 출석 일수 합 순, 같으면 포인트 합 순
 */
export function teamsOf(rows) {
  const byTeam = new Map();
  for (const row of rows) {
    if (!row.team || row.days <= 0) continue;
    const team = byTeam.get(row.team) ?? { team: row.team, fans: 0, days: 0, points: 0 };
    team.fans += 1;
    team.days += row.days;
    team.points += row.points;
    byTeam.set(row.team, team);
  }
  return [...byTeam.values()].filter((team) => team.fans >= TEAM_MIN_FANS).sort((a, b) => b.days - a.days || b.points - a.points);
}

/** 운영 설정(adminConfig/events)의 출석 2배 날 중 그 달 것 → 날짜(1~31) */
export function doubleDaysOf(list, month) {
  return [...new Set((Array.isArray(list) ? list : [])
    .filter((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value.slice(0, 4) + value.slice(5, 7) === month)
    .map((value) => Number(value.slice(8, 10))))].sort((a, b) => a - b);
}

export function histogramOf(ranked) {
  const histogram = {};
  for (const row of ranked) histogram[String(row.points)] = (histogram[String(row.points)] ?? 0) + 1;
  return histogram;
}

/** 회원 프로필(닉네임·최애 구단·숨기기) — 닉네임이 없는 회원은 등수에 넣지 않는다 */
async function loadMembers(db) {
  const snapshot = await db.collection('users').select('nickname', 'favoriteTeams', 'rankingHidden').get();
  const members = new Map();
  for (const item of snapshot.docs) {
    const nickname = item.get('nickname');
    if (typeof nickname !== 'string' || !nickname) continue;
    const teams = item.get('favoriteTeams');
    members.set(item.id, {
      nickname,
      team: Array.isArray(teams) && typeof teams[0] === 'string' ? teams[0] : null,
      hidden: item.get('rankingHidden') === true,
    });
  }
  return { members, uids: new Set(snapshot.docs.map((item) => item.id)) };
}

/** 한 달 계산(쓰지 않음) — 출석 포인트 + 공식 점수. 구단 대항전을 위해 0점인 줄도 함께 돌려준다 */
async function computeMonth(db, members, month, through, start, doubleDays) {
  const uids = [...members.keys()];
  const rows = [];
  for (let i = 0; i < uids.length; i += 150) {
    const chunk = uids.slice(i, i + 150);
    const refs = chunk.flatMap((uid) => [db.doc(`users/${uid}/attendance/${month}`), db.doc(`users/${uid}/officialMonth/${month}`)]);
    const snapshots = refs.length > 0 ? await db.getAll(...refs) : [];
    chunk.forEach((uid, index) => {
      const attendanceDoc = snapshots[index * 2];
      const officialDoc = snapshots[index * 2 + 1];
      if (!attendanceDoc.exists && !officialDoc.exists) return;
      const days = Array.isArray(attendanceDoc.get('days')) ? attendanceDoc.get('days') : [];
      const attendance = attendancePoints(days, month, through, start, doubleDays);
      const official = officialSum(officialDoc.exists ? officialDoc.get('days') : {}, month, through);
      rows.push({
        uid,
        ...members.get(uid),
        ...attendance,
        attendance: attendance.points,
        official: official.points,
        rounds: official.rounds,
        points: attendance.points + official.points,
      });
    });
  }
  return { ranked: rankRows(rows), teams: teamsOf(rows) };
}

const publicEntry = (row, titles) => ({
  rank: row.rank,
  nickname: row.hidden ? HIDDEN_NAME : row.nickname,
  team: row.hidden ? null : row.team,
  points: row.points,
  days: row.days,
  official: row.official,
  rounds: row.rounds,
  titles,
});

/**
 * 매일 실행: 지난달이 아직 확정 전이면 확정(칭호), 이번 달 등수 갱신, 탈퇴한 회원 지우기, 오래된 등수 지우기.
 * `start`·`now`는 테스트용.
 */
export async function runMonthly({ db, now = Date.now(), start = ENGAGEMENT_START }) {
  const month = kstMonthKey(now);
  const startMonth = startMonthOf(start);
  const report = { month, finalized: null, participants: 0, awards: 0, scrubbed: 0, removed: 0 };
  if (month < startMonth) return report;

  const { members, uids } = await loadMembers(db);
  // 출석 2배 날(관리자 "이벤트" 화면) — 문서 하나
  const doubleList = (await db.doc('adminConfig/events').get()).get('doubleDays') ?? [];

  // 1) 지난달 확정
  const last = previousMonth(month);
  let lastTitles = new Map();
  if (last >= startMonth) {
    const lastRef = db.doc(`leaderboards/${last}`);
    const lastDoc = await lastRef.get();
    if (!lastDoc.exists || lastDoc.get('final') !== true) {
      const lastDouble = doubleDaysOf(doubleList, last);
      const { ranked, teams } = await computeMonth(db, members, last, daysInMonth(last), start, lastDouble);
      const batch = db.batch();
      let awards = 0;
      for (const row of ranked) {
        const titles = titlesFor(row.rank, row.perfect);
        if (titles.length === 0) continue;
        lastTitles.set(row.uid, titles);
        batch.set(db.doc(`users/${row.uid}/awards/${last}`), { month: last, rank: row.rank, points: row.points, days: row.days, official: row.official, titles, at: FieldValue.serverTimestamp() });
        awards += 1;
      }
      const top = ranked.slice(0, RANKING_TOP);
      batch.set(lastRef, {
        month: last,
        top: top.map((row) => publicEntry(row, titlesFor(row.rank, row.perfect))),
        participants: ranked.length,
        histogram: histogramOf(ranked),
        through: daysInMonth(last),
        doubleDays: lastDouble,
        teams,
        final: true,
        updatedAt: FieldValue.serverTimestamp(),
      });
      batch.set(db.doc(`leaderboardKeys/${last}`), { uids: top.map((row) => row.uid) });
      await batch.commit(); // 칭호는 상위 10 + 개근 — 한 묶음(500) 안
      report.finalized = last;
      report.awards = awards;
    } else {
      const keys = await db.doc(`leaderboardKeys/${last}`).get();
      const top = lastDoc.get('top') ?? [];
      (keys.get('uids') ?? []).forEach((uid, index) => {
        if (top[index]?.titles?.length) lastTitles.set(uid, top[index].titles);
      });
    }
  }

  // 2) 이번 달 — 어제까지(1일에는 아직 셀 날이 없다)
  const through = Number(new Date(now + KST).getUTCDate()) - 1;
  const doubleDays = doubleDaysOf(doubleList, month);
  const { ranked, teams } = await computeMonth(db, members, month, through, start, doubleDays);
  const top = ranked.slice(0, RANKING_TOP);
  const batch = db.batch();
  batch.set(db.doc(`leaderboards/${month}`), {
    month,
    top: top.map((row) => publicEntry(row, lastTitles.get(row.uid) ?? [])),
    participants: ranked.length,
    histogram: histogramOf(ranked),
    through,
    // 출석 2배 날은 그 달 전부(앞으로 올 날도 — 화면이 "오늘은 2배"·예고를 보여 준다)
    doubleDays,
    teams,
    final: false,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.doc(`leaderboardKeys/${month}`), { uids: top.map((row) => row.uid) });
  await batch.commit();
  report.participants = ranked.length;

  // 3) 확정된 달에서 탈퇴한 회원 지우기, 4) 12달이 지난 등수 지우기
  const boards = await db.collection('leaderboards').get();
  let oldest = month;
  for (let i = 0; i < LEADERBOARD_MONTHS_KEPT; i += 1) oldest = previousMonth(oldest);
  for (const board of boards.docs) {
    if (board.id === month) continue;
    if (board.id < oldest) {
      await board.ref.delete();
      await db.doc(`leaderboardKeys/${board.id}`).delete();
      report.removed += 1;
      continue;
    }
    const keys = await db.doc(`leaderboardKeys/${board.id}`).get();
    const ids = keys.get('uids') ?? [];
    const topRows = board.get('top') ?? [];
    let changed = false;
    const next = topRows.map((entry, index) => {
      const uid = ids[index];
      if (!uid || uids.has(uid) || entry.nickname === REMOVED_NAME) return entry;
      changed = true;
      return { ...entry, nickname: REMOVED_NAME, team: null, titles: [] };
    });
    if (changed) {
      await board.ref.update({ top: next });
      report.scrubbed += 1;
    }
  }
  return report;
}
