/**
 * 관리자 운영 작업 — 운영자 PC에서 Admin SDK로(docs/admin-plan.md §2·§6). 규칙을 건너뛰므로 여기 코드가 곧 서버 규칙이다.
 *
 * - setAdmin: 계정에 관리자 표시(custom claim `admin`)를 붙이거나 뗀다. 관리자 화면은 이 표시를 만들 수 없다
 * - syncAccounts: 로그인 계정 목록 → `accountMirror/{uid}`(회원만, 바뀐 것만 쓰기) + `adminStats/accounts`(비회원은 개수만)
 * - processAdminTasks: 관리자 화면이 남긴 `adminTasks` 중 대기 중인 것을 처리하고 결과를 적는다
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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

export async function syncAccounts({ auth, db, now = Date.now() }) {
  const report = { members: 0, guests: 0, guestsActive7d: 0, guestsNew24h: 0, guestsPeakHour: 0, written: 0, removed: 0 };
  const guestCreated = [];
  const existing = new Map();
  for (const snapshot of (await db.collection('accountMirror').get()).docs) existing.set(snapshot.id, fromFirestore(snapshot.data()));

  const seen = new Set();
  const writer = db.bulkWriter();
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
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
      if (type === 'syncAccounts') results.syncAccounts ??= await syncAccounts({ auth, db, now });
      else throw new Error(`모르는 작업: ${type}`);
      await task.ref.update({ status: 'done', result: JSON.stringify(results[type]), doneAt: FieldValue.serverTimestamp() });
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
 * 기본은 어제. 같은 날을 다시 돌리면 덮어쓴다. 읽기: 그날 경기 수 + 계정 사본 수, 쓰기 1.
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
  const summary = { day: key, ...summarizeDay(games, memberUids), signups, builtAt: FieldValue.serverTimestamp() };
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
