/**
 * 관리자 운영 작업 — 운영자 PC에서 Admin SDK로(docs/admin-plan.md §2·§6). 규칙을 건너뛰므로 여기 코드가 곧 서버 규칙이다.
 *
 * - setAdmin: 계정에 관리자 표시(custom claim `admin`)를 붙이거나 뗀다. 관리자 화면은 이 표시를 만들 수 없다
 * - syncAccounts: 로그인 계정 목록 → `accountMirror/{uid}`(회원만, 바뀐 것만 쓰기) + `adminStats/accounts`(비회원은 개수만)
 * - processAdminTasks: 관리자 화면이 남긴 `adminTasks` 중 대기 중인 것을 처리하고 결과를 적는다
 *   (계정 동기화, 계정 삭제 — 사유 목록만, 초대 보상 취소)
 * - deleteAccount: 회원 한 명의 기록·팀 자리·닉네임 예약·초대 코드·로그인 계정을 지운다(관리자 계정은 지우지 않는다)
 * - weeklyFunnel: 계정 동기화가 함께 세는 주간 퍼널(docs/measurement-plan.md) — 수만 `adminDaily/{어제}.funnel`에
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { revokeInvite } from './invite.mjs';

/** 계정 삭제 사유 — src/admin/members.ts DELETE_REASONS·firestore.rules와 같아야 한다(단위 테스트) */
export const DELETE_REASONS = ['본인 요청', '보호자 요청', '만 14세 미만 의심', '보호자 동의 거절'];

/**
 * 회원 한 명을 지운다(관리자 요청). 앱의 탈퇴(src/lib/profile/save.ts)와 같은 범위를 서버 권한으로:
 * 팀 자리·신청서(인원·감독은 그날 0시 팀 작업이 맞춘다), 닉네임 예약, 초대 코드, 프로필과 모든 하위 기록, 로그인 계정.
 * 월간 등수의 닉네임·초대 진행 기록·공식전 답은 각자의 0시 작업이 탈퇴한 회원으로 보고 정리한다. 관리자 계정은 지우지 않는다
 */
export async function deleteAccount({ auth, db, uid, reason, by = 'ops' }) {
  if (!DELETE_REASONS.includes(reason)) throw new Error(`삭제 사유가 목록에 없음: ${reason}`);
  let authUser = null;
  try {
    authUser = await auth.getUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
  if (authUser?.customClaims?.admin === true) throw new Error('관리자 계정은 지우지 않음 — set-admin --remove 먼저');
  const profileRef = db.doc(`users/${uid}`);
  const profile = await profileRef.get();
  const removed = [];
  const batch = db.batch();
  const nickname = profile.get('nickname');
  if (typeof nickname === 'string' && nickname) {
    const key = db.doc(`nicknames/${nickname.toLowerCase()}`);
    if ((await key.get()).get('uid') === uid) {
      batch.delete(key);
      removed.push('닉네임 예약');
    }
  }
  const inviteCode = profile.get('inviteCode');
  if (typeof inviteCode === 'string' && inviteCode) {
    batch.delete(db.doc(`invites/${inviteCode}`));
    removed.push('초대 코드');
  }
  const squad = profile.get('squad');
  if (typeof squad === 'string' && squad) {
    batch.delete(db.doc(`squads/${squad}/members/${uid}`));
    batch.delete(db.doc(`squads/${squad}/requests/${uid}`));
    removed.push('팀 자리');
  }
  await batch.commit();
  await db.recursiveDelete(profileRef);
  removed.push('프로필·기록');
  if (authUser) {
    await auth.deleteUser(uid);
    removed.push('로그인 계정');
  }
  await db.collection('adminLogs').add({ by, action: 'delete-account', target: uid, detail: `${reason} — ${removed.join(', ')}`, at: FieldValue.serverTimestamp() });
  return { deleted: true, removed };
}

const DAY = 86_400_000;

/** 회원(이메일·구글) — 로그인 수단이 하나라도 있다. 비회원(익명)은 수단이 없다 */
export const isMemberAccount = (user) => (user.providerData ?? []).length > 0 || Boolean(user.email);

const time = (value) => (value ? Date.parse(value) : 0);

/** 계정 사본 한 장(비교·저장용). 동기화 시각은 넣지 않는다 — 넣으면 매번 "바뀜"이 된다 */
export function mirrorOf(user) {
  return {
    email: user.email ?? null,
    emailVerified: Boolean(user.emailVerified),
    providers: (user.providerData ?? []).map((provider) => provider.providerId).sort(),
    disabled: Boolean(user.disabled),
    createdAt: time(user.metadata?.creationTime),
    lastSignInAt: Math.max(time(user.metadata?.lastSignInTime), time(user.metadata?.lastRefreshTime)),
    admin: user.customClaims?.admin === true,
  };
}

const toFirestore = (mirror) => ({
  ...mirror,
  createdAt: Timestamp.fromMillis(mirror.createdAt),
  lastSignInAt: Timestamp.fromMillis(mirror.lastSignInAt),
});

const fromFirestore = (data) => ({
  email: data.email ?? null,
  emailVerified: Boolean(data.emailVerified),
  providers: [...(data.providers ?? [])].sort(),
  disabled: Boolean(data.disabled),
  createdAt: data.createdAt?.toMillis?.() ?? 0,
  lastSignInAt: data.lastSignInAt?.toMillis?.() ?? 0,
  admin: Boolean(data.admin),
});

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 이메일로 계정을 찾아 관리자 표시를 붙이거나 뗀다. 다른 표시는 그대로 둔다 */
export async function setAdmin({ auth, email, value = true }) {
  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims ?? {}) };
  if (value) claims.admin = true;
  else delete claims.admin;
  await auth.setCustomUserClaims(user.uid, claims);
  return { uid: user.uid, admin: value, emailVerified: user.emailVerified, providers: user.providerData.map((p) => p.providerId) };
}

/**
 * 재방문(docs/retention-plan.md L) — 0시 작업 기준 "어제" 다시 연 비율. 계정마다 처음 온 시각과 마지막으로 연 시각
 * (로그인·토큰 갱신 중 늦은 것 — 앱을 열면 갱신된다)만 쓰고 따로 모으지 않는다. 결과는 수만(사람을 가리키지 않는다).
 * - D1: 그저께 처음 온 계정 가운데 어제 다시 연 수
 * - D7: 8일 전 처음 온 계정 가운데 어제(7일째) 연 수
 * [처음 온 수, 다시 연 수]를 회원·비회원 따로
 */
export function returnRates(accounts, now = Date.now()) {
  const yesterday = kstDay(kstDay(now).start - 1);
  const count = (daysBefore) => {
    const start = yesterday.start - daysBefore * DAY;
    const out = { members: [0, 0], guests: [0, 0] };
    for (const account of accounts) {
      if (account.createdAt < start || account.createdAt >= start + DAY) continue;
      const bucket = account.member ? out.members : out.guests;
      bucket[0] += 1;
      if (account.lastActiveAt >= yesterday.start) bucket[1] += 1;
    }
    return out;
  };
  return { day: yesterday.key, d1: count(1), d7: count(7) };
}

// ── 주간 퍼널(docs/measurement-plan.md 1·2단계) ─────────────────────────────────
/** 유입 출처 기록 시행일·출처 목록 — 앱(src/lib/growth/acquisition.ts)·규칙과 같아야 한다(단위 테스트) */
export const ACQUISITION_START = '2026-11-25';
export const ACQUISITION_SOURCES = ['instagram', 'threads', 'x', 'openchat', 'community', 'share', 'toss', 'etc'];

const FUNNEL_STEPS = ['played', 'returned', 'signedUp', 'ageConfirmed'];

/**
 * 주간 퍼널 — 지난 7일(어제까지, 한국 시간)에 처음 온 계정이 어디까지 갔나, 그리고 그 7일 동안 경기를 끝낸 고유 사용자 수(북극성).
 * 이미 있는 정보(계정의 처음 온·마지막으로 연 시각, 경기 기록, 프로필의 만 14세 확인)만 쓴다. 결과는 수만. 순수 함수.
 * - accounts: 계정 목록 { uid, createdAt, lastActiveAt, member }
 * - players: 그 7일 동안 경기를 끝낸 uid 집합
 * - ageConfirmed: 만 14세 확인을 마친 uid 집합
 * - sources: uid → 유입 출처(기록이 있는 계정만). null이면 출처별로 나누지 않는다(시행 전)
 * 단계: 처음 온 계정 → 첫 경기 완료(played) → 다른 날 다시 옴(returned) → 가입(signedUp) → 만 14세 확인(ageConfirmed)
 */
export function weeklyFunnel({ accounts, players, ageConfirmed, sources = null, now = Date.now() }) {
  const yesterday = kstDay(kstDay(now).start - 1);
  const start = yesterday.start - 6 * DAY;
  const end = yesterday.start + DAY;
  const empty = () => ({ accounts: 0, played: 0, returned: 0, signedUp: 0, ageConfirmed: 0 });
  const cohort = empty();
  const bySource = sources ? {} : null;
  const memberUids = new Set();
  for (const account of accounts) {
    if (account.member) memberUids.add(account.uid);
    if (account.createdAt < start || account.createdAt >= end) continue;
    const reached = {
      played: players.has(account.uid),
      returned: account.lastActiveAt >= kstDay(account.createdAt).start + DAY,
      signedUp: account.member,
      ageConfirmed: account.member && ageConfirmed.has(account.uid),
    };
    const buckets = [cohort];
    if (bySource) buckets.push((bySource[sources.get(account.uid) ?? 'none'] ??= empty()));
    for (const bucket of buckets) {
      bucket.accounts += 1;
      for (const step of FUNNEL_STEPS) if (reached[step]) bucket[step] += 1;
    }
  }
  const weekly = { members: 0, guests: 0 };
  for (const uid of players) weekly[memberUids.has(uid) ? 'members' : 'guests'] += 1;
  return { day: yesterday.key, from: kstDay(start).key, to: yesterday.key, cohort, players: weekly, ...(bySource ? { bySource } : {}) };
}

const dashed = (key) => `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`;

/** 주간 퍼널에 필요한 것을 읽는다 — 읽기: 7일 경기 수 + 7일 동안 처음 온 회원 수 + (시행 뒤) 7일 동안 처음 온 계정 수 */
async function loadFunnel({ db, accounts, now }) {
  const yesterday = kstDay(kstDay(now).start - 1);
  const start = yesterday.start - 6 * DAY;
  const end = yesterday.start + DAY;
  const games = await db
    .collectionGroup('games')
    .where('createdAt', '>=', Timestamp.fromMillis(start))
    .where('createdAt', '<', Timestamp.fromMillis(end))
    .select()
    .get();
  const players = new Set(games.docs.map((item) => item.ref.parent.parent?.id).filter(Boolean));
  const cohort = accounts.filter((account) => account.createdAt >= start && account.createdAt < end);
  const getAll = async (refs) => (refs.length ? db.getAll(...refs) : []);
  const profiles = await getAll(cohort.filter((account) => account.member).map((account) => db.doc(`users/${account.uid}`)));
  const ageConfirmed = new Set(profiles.filter((item) => item.get('ageConfirmedAt') != null).map((item) => item.id));
  let sources = null;
  if (dashed(yesterday.key) >= ACQUISITION_START) {
    sources = new Map();
    for (const item of await getAll(cohort.map((account) => db.doc(`users/${account.uid}/meta/acquisition`)))) {
      const source = item.get('source');
      if (ACQUISITION_SOURCES.includes(source)) sources.set(item.ref.parent.parent.id, source);
    }
  }
  return weeklyFunnel({ accounts, players, ageConfirmed, sources, now });
}

export async function syncAccounts({ auth, db, now = Date.now() }) {
  const report = { members: 0, guests: 0, guestsActive7d: 0, guestsNew24h: 0, guestsPeakHour: 0, written: 0, removed: 0 };
  const guestCreated = [];
  const accounts = [];
  const existing = new Map();
  for (const snapshot of (await db.collection('accountMirror').get()).docs) existing.set(snapshot.id, fromFirestore(snapshot.data()));

  const seen = new Set();
  const writer = db.bulkWriter();
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      const { createdAt, lastSignInAt } = mirrorOf(user);
      accounts.push({ uid: user.uid, createdAt, lastActiveAt: lastSignInAt, member: isMemberAccount(user) });
      if (!isMemberAccount(user)) {
        report.guests += 1;
        if (mirrorOf(user).lastSignInAt >= now - 7 * DAY) report.guestsActive7d += 1;
        guestCreated.push(time(user.metadata?.creationTime));
        continue;
      }
      report.members += 1;
      seen.add(user.uid);
      const mirror = mirrorOf(user);
      if (!existing.has(user.uid) || !same(existing.get(user.uid), mirror)) {
        writer.set(db.doc(`accountMirror/${user.uid}`), { ...toFirestore(mirror), syncedAt: FieldValue.serverTimestamp() });
        report.written += 1;
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  // 지워진 계정의 사본은 지운다(사본만 남는 일이 없게)
  for (const uid of existing.keys()) {
    if (!seen.has(uid)) {
      writer.delete(db.doc(`accountMirror/${uid}`));
      report.removed += 1;
    }
  }
  Object.assign(report, guestBurst(guestCreated, now));
  writer.set(db.doc('adminStats/accounts'), {
    members: report.members,
    guests: report.guests,
    guestsActive7d: report.guestsActive7d,
    guestsNew24h: report.guestsNew24h,
    guestsPeakHour: report.guestsPeakHour,
    syncedAt: FieldValue.serverTimestamp(),
  });
  // 재방문·주간 퍼널은 어제의 하루 요약에 붙인다(하루 요약 작업 buildDailyStats가 다시 써도 남긴다)
  // 셀 무리(그저께·8일 전·지난 7일에 처음 온 계정, 7일 동안 경기한 사람)가 없으면 쓰지 않는다 — 빈 하루 요약 문서를 만들지 않게
  const rates = returnRates(accounts, now);
  const funnel = await loadFunnel({ db, accounts, now });
  const daily = {};
  const cohortSize = [rates.d1, rates.d7].reduce((sum, cohort) => sum + cohort.members[0] + cohort.guests[0], 0);
  if (cohortSize > 0) daily.retention = { d1: rates.d1, d7: rates.d7 };
  if (funnel.cohort.accounts + funnel.players.members + funnel.players.guests > 0) daily.funnel = funnel;
  if (Object.keys(daily).length > 0) writer.set(db.doc(`adminDaily/${rates.day}`), daily, { merge: true });
  report.retention = rates;
  report.funnel = funnel;
  await writer.close();
  return report;
}

/** 대기 중인 관리자 작업 처리. 같은 종류가 여럿이면 한 번만 돌리고 모두 완료로 적는다 */
export async function processAdminTasks({ auth, db, now = Date.now() }) {
  const pending = await db.collection('adminTasks').where('status', '==', 'pending').get();
  const results = {};
  for (const task of pending.docs) {
    const type = task.get('type');
    try {
      let result;
      if (type === 'syncAccounts') result = results.syncAccounts ??= await syncAccounts({ auth, db, now });
      else if (type === 'deleteAccount') {
        // 사람마다 따로 — 요청한 관리자를 기록에 남긴다
        result = await deleteAccount({ auth, db, uid: task.get('target'), reason: task.get('detail'), by: `ops:${String(task.get('by')).slice(0, 6)}` });
        results.deleteAccount = (results.deleteAccount ?? 0) + 1;
      } else if (type === 'revokeInvite') {
        result = await revokeInvite({ db, inviteeUid: task.get('target'), by: `ops:${String(task.get('by')).slice(0, 6)}` });
        results.revokeInvite = (results.revokeInvite ?? 0) + 1;
      } else throw new Error(`모르는 작업: ${type}`);
      await task.ref.update({ status: 'done', result: JSON.stringify(result).slice(0, 500), doneAt: FieldValue.serverTimestamp() });
    } catch (error) {
      await task.ref.update({ status: 'failed', result: String(error?.message ?? error), doneAt: FieldValue.serverTimestamp() });
    }
  }
  return { processed: pending.size, results };
}

// ── 매일 밤 통계 요약(docs/admin-dashboard-plan.md 2-E) ────────────────────────
const KST = 9 * 3_600_000;
const HOUR = 3_600_000;

/** 한국 날짜 0시(ms)와 "YYYYMMDD" */
export function kstDay(ms) {
  const start = Math.floor((ms + KST) / DAY) * DAY - KST;
  return { start, key: new Date(start + KST).toISOString().slice(0, 10).replaceAll('-', '') };
}

/** 이상 감시: 한 시간에 새 비회원 계정이 이만큼 넘으면 대시보드 "살펴볼 것"(하루 3판 우회 신호) */
export const GUEST_BURST_PER_HOUR = 30;

/**
 * 경기 목록 → 하루 요약. 순수 함수(테스트용). `memberUids`는 회원 uid 집합(계정 사본).
 * 문항별 [나온 수, 맞힌 수]를 남겨 여러 날을 합쳐 "많이 틀린 문항"을 계산할 수 있게 한다.
 */
export function summarizeDay(games, memberUids) {
  const players = new Set();
  const hourly = Array.from({ length: 24 }, () => 0);
  const questions = {};
  let runs = 0;
  let atBats = 0;
  let correct = 0;
  let homeRuns = 0;
  let memberGames = 0;
  let levelTests = 0;
  for (const game of games) {
    players.add(game.uid);
    if (memberUids.has(game.uid)) memberGames += 1;
    if (game.mode === 'levelTest') levelTests += 1;
    runs += game.runs;
    hourly[new Date(game.createdAt + KST).getUTCHours()] += 1;
    for (const atBat of game.atBats) {
      atBats += 1;
      if (atBat.correct) correct += 1;
      if (atBat.result === 'HR') homeRuns += 1;
      const tally = (questions[atBat.questionId] ??= [0, 0]);
      tally[0] += 1;
      if (atBat.correct) tally[1] += 1;
    }
  }
  const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;
  return {
    games: games.length,
    levelTests,
    practice: games.length - levelTests,
    memberGames,
    guestGames: games.length - memberGames,
    players: players.size,
    averageRuns: games.length ? round(runs / games.length, 1) : 0,
    atBats,
    correctRate: atBats ? round(correct / atBats, 3) : 0,
    homeRunRate: atBats ? round(homeRuns / atBats, 3) : 0,
    hourly,
    questions,
  };
}

/**
 * 하루(한국 시간) 요약을 `adminDaily/{YYYYMMDD}`에 쓴다 — 관리 화면은 이 요약만 읽는다(원본 경기를 다시 읽지 않음).
 * 기본은 어제. 같은 날을 다시 돌리면 덮어쓴다(재방문·주간 퍼널 칸은 남긴다). 읽기: 그날 경기 수 + 계정 사본 수 + 1, 쓰기 1.
 */
export async function buildDailyStats({ db, now = Date.now(), day }) {
  const { start, key } = day ? kstDay(Date.parse(`${day}T00:00:00+09:00`)) : kstDay(kstDay(now).start - 1);
  const end = start + DAY;
  const [snapshot, mirrors] = await Promise.all([
    db.collectionGroup('games').where('createdAt', '>=', Timestamp.fromMillis(start)).where('createdAt', '<', Timestamp.fromMillis(end)).get(),
    db.collection('accountMirror').get(),
  ]);
  const games = snapshot.docs.map((item) => ({
    uid: item.ref.parent.parent?.id ?? '',
    mode: item.get('mode'),
    runs: Number(item.get('runs') ?? 0),
    createdAt: item.get('createdAt')?.toMillis?.() ?? start,
    atBats: Array.isArray(item.get('atBats')) ? item.get('atBats') : [],
  }));
  const memberUids = new Set(mirrors.docs.map((item) => item.id));
  const signups = mirrors.docs.filter((item) => {
    const created = item.get('createdAt')?.toMillis?.() ?? 0;
    return created >= start && created < end;
  }).length;
  // 계정 동기화가 먼저 붙인 재방문(retention)·주간 퍼널(funnel)은 남긴다(읽기 1)
  const before = await db.doc(`adminDaily/${key}`).get();
  const kept = Object.fromEntries(['retention', 'funnel'].filter((name) => before.get(name) != null).map((name) => [name, before.get(name)]));
  const summary = { day: key, ...summarizeDay(games, memberUids), signups, ...kept, builtAt: FieldValue.serverTimestamp() };
  await db.doc(`adminDaily/${key}`).set(summary);
  return { day: key, games: summary.games, players: summary.players, signups };
}

/** 최근 24시간 새 비회원 수와 가장 많이 생긴 한 시간 — 계정 동기화가 함께 센다 */
export function guestBurst(creationTimes, now = Date.now()) {
  const recent = creationTimes.filter((ms) => ms >= now - DAY && ms <= now);
  const perHour = new Map();
  for (const ms of recent) {
    const hour = Math.floor(ms / HOUR);
    perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
  }
  return { guestsNew24h: recent.length, guestsPeakHour: Math.max(0, ...perHour.values()) };
}
