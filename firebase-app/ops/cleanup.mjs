/**
 * 정리 작업 — 무료 플랜에는 자동 삭제(TTL)가 없어(결제 필요) 관리자 권한으로 직접 지운다.
 * GitHub Actions 예약 작업(꺼진 상태, .github/workflows/firebase-cleanup.yml)이나 운영자 PC에서 돈다.
 *
 * 지우는 것
 * 1. 친구 대결 방: 만든 지 ROOM_RETENTION_HOURS가 지난 방(끝났든, 버려졌든)과 그 자리 전부
 * 2. 주인 없는 자리: 방장이 방을 닫아 방 문서가 없는데 남은 다른 사람의 자리(규칙상 남이 못 지운다)
 * 3. 비회원: 마지막 이용 뒤 GUEST_RETENTION_DAYS가 지난 익명 계정과 그 기록 전부(경기·누적·카운터·오답)
 * 4. 관리자 기록(adminLogs): ADMIN_LOG_RETENTION_DAYS(2년)가 지난 것
 *    — 기존 앱의 처리방침 기준(비회원 체험 기록 30일)을 그대로 따른다
 *
 * 안전장치: 기본은 **미리 보기**(dryRun) — 지울 것을 세기만 한다. 한 번에 지우는 문서 수에 상한을 둔다
 * (무료 삭제 한도 하루 2만). 회원 계정·회원 기록은 건드리지 않는다.
 */
export const ROOM_RETENTION_HOURS = 24;
export const GUEST_RETENTION_DAYS = 30;
/** 운영자 열람·처리 기록(관리자 접속기록) — 처리방침(2026-11-03 시행)의 2년 */
export const ADMIN_LOG_RETENTION_DAYS = 730;
export const DEFAULT_MAX_DELETES = 5000;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 익명 계정인가 — 연결된 로그인 수단(이메일·구글)이 하나도 없다 */
export function isAnonymous(user) {
  return (user.providerData ?? []).length === 0 && !user.email;
}

/** 마지막으로 쓴 때(만든 때·로그인·토큰 갱신 중 가장 늦은 것) */
export function lastActiveMs(user) {
  const times = [user.metadata?.creationTime, user.metadata?.lastSignInTime, user.metadata?.lastRefreshTime]
    .map((value) => (value ? Date.parse(value) : 0))
    .filter(Number.isFinite);
  return Math.max(0, ...times);
}

/**
 * @param {object} options
 * @param {import('firebase-admin/firestore').Firestore} options.db
 * @param {import('firebase-admin/auth').Auth} options.auth
 * @param {number} [options.now]
 * @param {boolean} [options.dryRun] 기본 true — 세기만
 * @param {number} [options.maxDeletes] 이번 실행에서 지울 Firestore 문서 상한
 */
export async function cleanup({ db, auth, now = Date.now(), dryRun = true, maxDeletes = DEFAULT_MAX_DELETES, log = () => {} }) {
  const report = { dryRun, rooms: 0, orphanSeats: 0, guests: 0, adminLogs: 0, deletedDocs: 0, stoppedAtLimit: false };
  let budget = maxDeletes;

  /** 문서와 하위 문서를 지운다. 지운 수를 센다. 미리 보기면 세기만 */
  async function remove(ref) {
    if (dryRun) {
      const count = await countTree(ref);
      report.deletedDocs += count;
      budget -= count;
      return;
    }
    const writer = db.bulkWriter();
    writer.onWriteResult(() => {
      report.deletedDocs += 1;
      budget -= 1;
    });
    await db.recursiveDelete(ref, writer);
  }

  const outOfBudget = () => {
    if (budget > 0) return false;
    report.stoppedAtLimit = true;
    return true;
  };

  // 1. 오래된 방
  const roomCutoff = new Date(now - ROOM_RETENTION_HOURS * HOUR);
  const oldRooms = await db.collection('rooms').where('createdAt', '<', roomCutoff).get();
  for (const room of oldRooms.docs) {
    if (outOfBudget()) break;
    await remove(room.ref);
    report.rooms += 1;
  }
  log(`방 ${report.rooms}개`);

  // 2. 방 문서는 없는데 자리만 남은 것
  if (!outOfBudget()) {
    const refs = await db.collection('rooms').listDocuments();
    for (const ref of refs) {
      if (outOfBudget()) break;
      if ((await ref.get()).exists) continue;
      const seats = await ref.collection('players').listDocuments();
      for (const seat of seats) {
        if (outOfBudget()) break;
        await remove(seat);
        report.orphanSeats += 1;
      }
    }
  }
  log(`주인 없는 자리 ${report.orphanSeats}개`);

  // 3. 오래 쓰지 않은 비회원
  const guestCutoff = now - GUEST_RETENTION_DAYS * DAY;
  let pageToken;
  outer: do {
    const page = await auth.listUsers(1000, pageToken);
    const expired = page.users.filter((user) => isAnonymous(user) && lastActiveMs(user) < guestCutoff);
    const done = [];
    for (const user of expired) {
      if (outOfBudget()) {
        if (!dryRun && done.length > 0) await auth.deleteUsers(done);
        break outer;
      }
      await remove(db.collection('users').doc(user.uid));
      done.push(user.uid);
      report.guests += 1;
    }
    // 기록을 먼저 지우고 계정을 지운다 — 반대로 하면 주인 없는 기록이 남는다
    if (!dryRun && done.length > 0) await auth.deleteUsers(done);
    pageToken = page.pageToken;
  } while (pageToken);
  log(`비회원 ${report.guests}명`);

  // 4. 보관 기간이 지난 관리자 기록(2년). 기기·관리자 화면은 지울 수 없고(규칙) 여기서만 지운다
  if (!outOfBudget()) {
    const logCutoff = new Date(now - ADMIN_LOG_RETENTION_DAYS * DAY);
    const oldLogs = await db.collection('adminLogs').where('at', '<', logCutoff).limit(Math.max(1, budget)).get();
    for (const entry of oldLogs.docs) {
      if (outOfBudget()) break;
      await remove(entry.ref);
      report.adminLogs += 1;
    }
  }
  log(`관리자 기록 ${report.adminLogs}건`);

  return report;
}

/** 문서 하나 + 모든 하위 컬렉션 문서 수(미리 보기용). 문서가 없어도 그 아래 문서는 센다 */
async function countTree(ref) {
  let count = (await ref.get()).exists ? 1 : 0;
  for (const collection of await ref.listCollections()) {
    for (const child of await collection.listDocuments()) count += await countTree(child);
  }
  return count;
}
