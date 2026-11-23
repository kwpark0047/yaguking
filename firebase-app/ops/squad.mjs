/**
 * 팀(2단계)·팀 주간 리그(3단계) — 운영자 PC 매일 0시 작업(admin-cli squads). 공식전 채점(official) 뒤, 지갑(wallet) 앞에 돈다.
 *
 * 1. 정리: 탈퇴한 회원의 팀원 자리·신청서를 지우고, 팀원 닉네임을 프로필과 맞추고, 인원(size)을 다시 센다.
 *    감독이 없어졌으면 가장 먼저 들어온 팀원(자녀 아님)에게, 코치가 없어졌으면 비운다. 아무도 없으면 팀을 지운다
 * 2. 리그: 이번 주(월~일, 한국 날짜) 어제까지 팀원이 푼 오늘의 공식전 점수(users/{uid}/officialMonth — 운영자 PC 채점)를
 *    팀원마다 더하고, 팀 점수 = 상위 5명의 평균. 한 번이라도 푼 팀원이 있는 팀만 순위에 든다.
 *    squadLeague/{월요일}(상위 50팀)과 squads/{코드}/weeks/{월요일}(팀원 기여 점수)에 쓴다
 * 3. 확정: 지난주가 아직 확정되지 않았으면 확정하고, 1~3위 팀에서 그 주에 한 번 이상 푼 팀원에게 보너스 30·20·10P
 *    (users/{uid}/meta/squads — 주마다 기록해 다시 돌려도 같다), 그 팀 로고에 주간 배지(squads.badge)
 *
 * 보너스는 지갑 작업이 힌트에 쓰는 포인트에 더한다(월간 등수에는 넣지 않는다). 값은 src/lib/squad/squad.ts와 같아야 한다(단위 테스트).
 * `now`·`start`는 테스트용. 읽기: 팀 수 + 팀원·신청서 수 + 팀원 프로필·공식전 달 문서, 쓰기: 바뀐 것만 + 리그 문서.
 */
import { FieldValue } from 'firebase-admin/firestore';

export const SQUAD_START = '2026-12-15';
export const SQUAD_MAX = 9;
export const LEAGUE_TOP = 5;
export const LEAGUE_REWARDS = [30, 20, 10];
export const LEAGUE_TABLE_MAX = 50;

const KST = 9 * 3_600_000;
const DAY = 86_400_000;
const kstDateOf = (ms) => new Date(ms + KST).toISOString().slice(0, 10);

export function weekStartOf(day) {
  const date = new Date(`${day}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * DAY).toISOString().slice(0, 10);
}

export function weekDays(weekStart) {
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => new Date(start + index * DAY).toISOString().slice(0, 10));
}

export function squadScore(points) {
  const top = [...points].sort((a, b) => b - a).slice(0, LEAGUE_TOP);
  if (top.length === 0) return 0;
  return Math.round(top.reduce((sum, value) => sum + value, 0) / top.length);
}

/** 팀들 → 순위(점수, 같으면 참가 인원, 같으면 코드 순). 참가한 팀원이 없는 팀은 뺀다 (순수 함수) */
export function rankSquads(rows) {
  return rows
    .filter((row) => row.players > 0)
    .sort((a, b) => b.score - a.score || b.players - a.players || a.code.localeCompare(b.code))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/** 주마다 받은 보너스 → 합계 (순수 함수) */
export const bonusOf = (weeks) => Object.values(weeks ?? {}).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);

/** 공식전 달 문서들(days.{YYYYMMDD}) → 주 안의 점수 합과 푼 날 수 (순수 함수) */
export function weekPoints(monthDocs, days) {
  const wanted = new Set(days.map((day) => day.replaceAll('-', '')));
  let points = 0;
  let played = 0;
  for (const month of monthDocs) {
    for (const [day, value] of Object.entries(month ?? {})) {
      if (!wanted.has(day) || !Number.isFinite(value)) continue;
      points += value;
      played += 1;
    }
  }
  return { points, days: played };
}

async function deleteTree(db, ref) {
  await db.recursiveDelete(ref);
}

/** 1. 정리 — 팀 하나. 남은 팀원(들어온 순)을 돌려준다. 팀을 지웠으면 null */
async function tidySquad(db, squad, report) {
  const code = squad.id;
  const [membersSnap, requestsSnap] = await Promise.all([squad.ref.collection('members').get(), squad.ref.collection('requests').get()]);
  const uids = [...new Set([...membersSnap.docs, ...requestsSnap.docs].map((item) => item.id))];
  const profiles = new Map();
  for (let i = 0; i < uids.length; i += 100) {
    const chunk = uids.slice(i, i + 100);
    const docs = await db.getAll(...chunk.map((uid) => db.doc(`users/${uid}`)));
    docs.forEach((item, index) => profiles.set(chunk[index], item));
  }
  const batch = db.batch();
  let writes = 0;
  const members = [];
  for (const member of membersSnap.docs) {
    const profile = profiles.get(member.id);
    if (!profile?.exists) {
      batch.delete(member.ref);
      writes += 1;
      report.removedMembers += 1;
      continue;
    }
    const nickname = profile.get('nickname');
    if (typeof nickname === 'string' && nickname && nickname !== member.get('nickname')) {
      batch.update(member.ref, { nickname });
      writes += 1;
    }
    members.push({
      uid: member.id,
      nickname: typeof nickname === 'string' && nickname ? nickname : String(member.get('nickname') ?? ''),
      child: member.get('child') === true,
      joinedAt: member.get('joinedAt')?.toMillis?.() ?? 0,
    });
  }
  // 신청서: 탈퇴했거나, 이제 다른 팀을 가리키거나, 이미 팀원이면 지운다
  for (const request of requestsSnap.docs) {
    const profile = profiles.get(request.id);
    if (!profile?.exists || profile.get('squad') !== code || members.some((member) => member.uid === request.id)) {
      batch.delete(request.ref);
      writes += 1;
      report.removedRequests += 1;
    }
  }
  members.sort((a, b) => a.joinedAt - b.joinedAt);
  // 아무도 없거나 보호자 동의 계정(자녀)만 남으면 팀을 없앤다 — 감독을 맡을 사람이 없다. 자녀 기기는 다음에 열 때 팀 코드를 비운다
  if (members.length === 0 || members.every((member) => member.child)) {
    if (writes > 0) await batch.commit();
    await deleteTree(db, squad.ref);
    report.removedSquads += 1;
    return null;
  }
  const fix = {};
  if (squad.get('size') !== members.length) fix.size = members.length;
  const has = (uid) => members.some((member) => member.uid === uid && !member.child);
  if (!has(squad.get('captain'))) fix.captain = members.find((member) => !member.child).uid;
  const captain = fix.captain ?? squad.get('captain');
  const coach = squad.get('coach');
  if (coach && (!has(coach) || coach === captain)) fix.coach = null;
  if (Object.keys(fix).length > 0) {
    batch.update(squad.ref, fix);
    writes += 1;
    report.fixedSquads += 1;
  }
  if (writes > 0) await batch.commit();
  return members;
}

/** 2·3. 한 주 계산(그리고 쓰기). final이면 확정(보상·배지) */
async function computeWeek(db, squads, week, through, final, report, start) {
  const days = weekDays(week).filter((day) => day <= through && day >= start);
  const months = [...new Set(days.map((day) => day.slice(0, 7).replace('-', '')))];
  const rows = [];
  const contributions = new Map();
  for (const { doc, members } of squads) {
    const monthDocs = await Promise.all(
      members.map((member) => db.getAll(...months.map((month) => db.doc(`users/${member.uid}/officialMonth/${month}`)))),
    );
    const list = members
      .map((member, index) => ({ uid: member.uid, nickname: member.nickname, ...weekPoints(monthDocs[index].map((item) => item.get('days') ?? {}), days) }))
      .sort((a, b) => b.points - a.points || b.days - a.days);
    const players = list.filter((member) => member.days > 0);
    contributions.set(doc.id, list);
    rows.push({
      code: doc.id,
      name: String(doc.get('name') ?? ''),
      hidden: doc.get('hidden') === true,
      kind: String(doc.get('kind') ?? 'friends'),
      logo: doc.get('logo') ?? null,
      score: squadScore(players.map((member) => member.points)),
      players: players.length,
      size: members.length,
    });
  }
  const ranked = rankSquads(rows);
  const rankOf = new Map(ranked.map((row) => [row.code, row.rank]));
  await db.doc(`squadLeague/${week}`).set({
    week,
    from: days[0] ?? week,
    to: weekDays(week)[6],
    through,
    final,
    count: ranked.length,
    squads: ranked.slice(0, LEAGUE_TABLE_MAX),
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (let i = 0; i < squads.length; i += 400) {
    const batch = db.batch();
    for (const { doc } of squads.slice(i, i + 400)) {
      const list = contributions.get(doc.id) ?? [];
      batch.set(doc.ref.collection('weeks').doc(week), {
        week,
        through,
        final,
        score: rows.find((row) => row.code === doc.id)?.score ?? 0,
        rank: rankOf.get(doc.id) ?? null,
        members: list.map(({ nickname, points, days: played }) => ({ nickname, points, days: played })),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  report.ranked = ranked.length;
  if (!final) return;

  // 확정 — 1~3위 팀의 참가 팀원 보너스, 로고 배지
  report.finalized = week;
  const rewardOf = new Map();
  for (const row of ranked.slice(0, LEAGUE_REWARDS.length)) {
    for (const member of contributions.get(row.code) ?? []) {
      if (member.days > 0) rewardOf.set(member.uid, LEAGUE_REWARDS[row.rank - 1]);
    }
  }
  for (const [uid, points] of rewardOf) {
    const ref = db.doc(`users/${uid}/meta/squads`);
    const current = await ref.get();
    const weeks = { ...(current.get('weeks') ?? {}), [week]: points };
    if (current.exists && current.get('weeks')?.[week] === points) continue;
    await ref.set({ weeks, bonus: bonusOf(weeks), updatedAt: FieldValue.serverTimestamp() });
    report.rewarded += 1;
  }
  const batch = db.batch();
  for (const { doc } of squads) {
    const rank = rankOf.get(doc.id);
    const badge = rank && rank <= LEAGUE_REWARDS.length ? { week, rank } : null;
    const before = doc.get('badge') ?? null;
    if (badge ? before?.week === week && before?.rank === rank : before === null || (before && before.week > week)) continue;
    batch.update(doc.ref, { badge: badge ?? FieldValue.delete() });
  }
  await batch.commit();
}

export async function runSquads({ db, now = Date.now(), start = SQUAD_START }) {
  const report = {
    started: false,
    squads: 0,
    removedMembers: 0,
    removedRequests: 0,
    removedSquads: 0,
    fixedSquads: 0,
    ranked: 0,
    finalized: null,
    rewarded: 0,
  };
  const today = kstDateOf(now);
  if (today < start) return report;
  report.started = true;

  const squads = [];
  for (const doc of (await db.collection('squads').get()).docs) {
    const members = await tidySquad(db, doc, report);
    if (members) squads.push({ doc: await doc.ref.get(), members });
  }
  report.squads = squads.length;

  const yesterday = kstDateOf(now - DAY);
  if (yesterday < start) return report; // 첫날 — 아직 푼 공식전이 없다
  const thisWeek = weekStartOf(yesterday);
  const lastWeek = weekStartOf(kstDateOf(Date.parse(`${thisWeek}T00:00:00Z`) - DAY));
  // 지난주가 시작일 뒤에 걸쳐 있고 아직 확정되지 않았으면 확정(월요일 0시 — 어제가 일요일이면 이번 주가 곧 지난주)
  const weekEnded = weekDays(thisWeek)[6] === yesterday;
  if (weekEnded) {
    await computeWeek(db, squads, thisWeek, yesterday, true, report, start);
    return report;
  }
  if (weekDays(lastWeek)[6] >= start) {
    const last = await db.doc(`squadLeague/${lastWeek}`).get();
    if (last.get('final') !== true) await computeWeek(db, squads, lastWeek, weekDays(lastWeek)[6], true, report, start);
  }
  await computeWeek(db, squads, thisWeek, yesterday, false, report, start);
  return report;
}

/** 운영자가 팀 이름을 숨기기·다시 보이기(비속어·사칭 등) — 관리자 기록을 남긴다 */
export async function hideSquad({ db, code, hidden = true, by = 'ops' }) {
  const ref = db.doc(`squads/${code}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { changed: false, reason: '없는 팀' };
  const batch = db.batch();
  batch.update(ref, { hidden });
  batch.set(db.collection('adminLogs').doc(), {
    by,
    action: hidden ? 'squad-hide' : 'squad-show',
    target: code,
    detail: String(snapshot.get('name') ?? '').slice(0, 100),
    at: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return { changed: true, code, hidden };
}

/** 팀 목록(운영자 PC 확인용) */
export async function listSquads({ db }) {
  const snapshot = await db.collection('squads').get();
  return snapshot.docs.map((item) => ({
    code: item.id,
    name: item.get('name'),
    kind: item.get('kind'),
    size: item.get('size'),
    hidden: item.get('hidden') === true,
  }));
}
