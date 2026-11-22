/**
 * 친구 초대 1단계 — 운영자 PC 매일 0시 작업(admin-cli invites). 지갑 작업(wallet)보다 먼저 돈다.
 *
 * 1. 초대 코드를 연결한 회원(users.invitedBy)마다 inviteLedger/{uid}를 만든다(가입 — 활동 확인 중)
 * 2. 연결한 날부터 7일 안에 서로 다른 2일 경기(users/{uid}/daily/{한국 날짜 일련번호})가 있으면 보상: 초대한 사람 100P, 받은 사람 50P.
 *    이벤트 기간이면 배수. 초대한 사람은 한 달에 10명까지(넘으면 받은 사람만). 7일이 지나도 안 되면 '기간 지남'
 * 3. 회원마다 보너스 합계·보상 인원·칭호를 users/{uid}/meta/invites에 다시 계산해 쓴다(진행 기록 전체에서 — 다시 돌려도 같다).
 *    지갑 작업이 이 보너스를 모은 포인트에 더한다. 월간 등수에는 넣지 않는다
 * 4. 탈퇴한 회원(초대한 사람이든 받은 사람이든)의 진행 기록을 지운다
 *
 * 값은 src/lib/growth/invite.ts와 같아야 한다(단위 테스트). `now`·`start`는 테스트용.
 * 읽기: 연결한 회원 수 + 진행 기록 수 + 활동 확인 중인 사람마다 7, 쓰기: 바뀐 것만.
 */
import { FieldValue } from 'firebase-admin/firestore';

export const INVITE_START = '2026-12-01';
export const INVITE_POINTS = { inviter: 100, invitee: 50 };
export const INVITE_MONTHLY_CAP = 10;
export const INVITE_ACTIVE_WINDOW_DAYS = 7;
export const INVITE_ACTIVE_DAYS = 2;
export const INVITE_MILESTONES = [
  { count: 3, title: 'scout', points: 100 },
  { count: 10, title: 'gm', points: 300 },
];
export const INVITE_EVENTS = [{ id: 'scout-week-2026', start: '2026-12-01', end: '2026-12-14', multiplier: 2 }];

const KST = 9 * 3_600_000;
const DAY = 86_400_000;
const kstDateOf = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
const daySerialOf = (ms) => Math.trunc((ms + KST) / DAY);
const serialToDate = (serial) => new Date(serial * DAY).toISOString().slice(0, 10);

export function eventFor(day) {
  return INVITE_EVENTS.find((event) => event.start <= day && day <= event.end) ?? null;
}

/** 연결한 날(일련번호)과 경기한 날들 → 활동 확인된 날(두 번째 경기 날, 일련번호) 또는 null (순수 함수) */
export function activeDayOf(linkedSerial, playedSerials) {
  const inWindow = [...new Set(playedSerials)].filter((day) => day >= linkedSerial && day < linkedSerial + INVITE_ACTIVE_WINDOW_DAYS).sort((a, b) => a - b);
  return inWindow.length >= INVITE_ACTIVE_DAYS ? inWindow[INVITE_ACTIVE_DAYS - 1] : null;
}

/** 진행 기록들 → 회원마다 보너스·보상 인원·칭호 (순수 함수) */
export function summarize(entries) {
  const byUid = new Map();
  const get = (uid) => byUid.get(uid) ?? byUid.set(uid, { bonus: 0, rewarded: 0, titles: [] }).get(uid);
  for (const entry of entries) {
    if (entry.status !== 'rewarded') continue;
    get(entry.invitee).bonus += entry.inviteePoints ?? 0;
    const inviter = get(entry.inviter);
    inviter.bonus += entry.inviterPoints ?? 0;
    // 한 달 상한을 넘어 초대한 사람이 0P인 초대는 보상 인원·칭호에 세지 않는다
    if ((entry.inviterPoints ?? 0) > 0) inviter.rewarded += 1;
  }
  for (const summary of byUid.values()) {
    for (const milestone of INVITE_MILESTONES) {
      if (summary.rewarded >= milestone.count) {
        summary.titles.push(milestone.title);
        summary.bonus += milestone.points;
      }
    }
  }
  return byUid;
}

export async function runInvites({ db, now = Date.now(), start = INVITE_START }) {
  const report = { started: false, linked: 0, created: 0, rewarded: 0, expired: 0, capped: 0, removed: 0, summaries: 0 };
  if (kstDateOf(now) < start) return report;
  report.started = true;
  const todaySerial = daySerialOf(now);

  // 1. 연결한 회원 → 진행 기록(없으면 만든다)
  const linkedUsers = await db.collection('users').where('invitedBy', '!=', null).select('invitedBy', 'invitedAt', 'nickname').get();
  report.linked = linkedUsers.size;
  const ledgerSnap = await db.collection('inviteLedger').get();
  const ledger = new Map(ledgerSnap.docs.map((item) => [item.id, { ref: item.ref, ...item.data() }]));
  const codes = new Map();
  const inviterOf = async (code) => {
    if (!codes.has(code)) codes.set(code, (await db.doc(`invites/${code}`).get()).get('uid') ?? null);
    return codes.get(code);
  };

  for (const user of linkedUsers.docs) {
    if (ledger.has(user.id)) continue;
    const inviter = await inviterOf(user.get('invitedBy'));
    const linkedAt = user.get('invitedAt')?.toMillis?.() ?? now;
    if (!inviter || inviter === user.id) continue;
    const entry = {
      inviter,
      invitee: user.id,
      code: user.get('invitedBy'),
      nickname: String(user.get('nickname') ?? '회원').slice(0, 16),
      status: 'joined',
      linkedDay: kstDateOf(linkedAt),
      linkedSerial: daySerialOf(linkedAt),
      inviterPoints: 0,
      inviteePoints: 0,
      updatedAt: FieldValue.serverTimestamp(),
    };
    await db.doc(`inviteLedger/${user.id}`).set(entry);
    ledger.set(user.id, { ref: db.doc(`inviteLedger/${user.id}`), ...entry });
    report.created += 1;
  }

  // 4. 탈퇴한 회원의 기록 지우기 — 초대한 사람·받은 사람 문서가 없으면
  const uids = [...new Set([...ledger.values()].flatMap((entry) => [entry.inviter, entry.invitee]))];
  const alive = new Set();
  for (let i = 0; i < uids.length; i += 100) {
    const docs = await db.getAll(...uids.slice(i, i + 100).map((uid) => db.doc(`users/${uid}`)));
    docs.forEach((item) => item.exists && alive.add(item.id));
  }
  const touched = new Set([...ledger.values()].flatMap((entry) => [entry.inviter, entry.invitee]));
  for (const [id, entry] of ledger) {
    if (alive.has(entry.inviter) && alive.has(entry.invitee)) continue;
    await entry.ref.delete();
    ledger.delete(id);
    report.removed += 1;
  }

  // 2. 활동 확인 — 어제까지 경기한 날만 센다(오늘 날짜는 아직 끝나지 않았다)
  const rewardedThisMonth = new Map();
  const month = kstDateOf(now - DAY).slice(0, 7);
  for (const entry of ledger.values()) {
    if (entry.status === 'rewarded' && entry.activeDay?.slice(0, 7) === month && (entry.inviterPoints ?? 0) > 0) {
      rewardedThisMonth.set(entry.inviter, (rewardedThisMonth.get(entry.inviter) ?? 0) + 1);
    }
  }
  const waiting = [...ledger.values()].filter((entry) => entry.status === 'joined').sort((a, b) => a.linkedSerial - b.linkedSerial);
  for (const entry of waiting) {
    const serials = Array.from({ length: INVITE_ACTIVE_WINDOW_DAYS }, (_, index) => entry.linkedSerial + index).filter((serial) => serial < todaySerial);
    const days = serials.length > 0 ? await db.getAll(...serials.map((serial) => db.doc(`users/${entry.invitee}/daily/${serial}`))) : [];
    const played = days.filter((item) => item.exists && Number(item.get('count') ?? 0) > 0).map((item) => Number(item.id));
    const active = activeDayOf(entry.linkedSerial, played);
    if (active !== null) {
      const activeDay = serialToDate(active);
      const multiplier = eventFor(activeDay)?.multiplier ?? 1;
      const used = rewardedThisMonth.get(entry.inviter) ?? 0;
      const capped = used >= INVITE_MONTHLY_CAP;
      const update = {
        status: 'rewarded',
        activeDay,
        event: eventFor(activeDay)?.id ?? null,
        inviterPoints: capped ? 0 : INVITE_POINTS.inviter * multiplier,
        inviteePoints: INVITE_POINTS.invitee * multiplier,
        capped,
        rewardedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      await entry.ref.set(update, { merge: true });
      Object.assign(entry, update);
      if (!capped) rewardedThisMonth.set(entry.inviter, used + 1);
      report.rewarded += 1;
      if (capped) report.capped += 1;
    } else if (todaySerial >= entry.linkedSerial + INVITE_ACTIVE_WINDOW_DAYS) {
      await entry.ref.set({ status: 'expired', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      entry.status = 'expired';
      report.expired += 1;
    }
  }

  // 3. 회원마다 합계 — 진행 기록 전체에서 다시 계산(바뀐 것만 쓴다)
  // 진행 기록에 나온 적 있는 회원 모두(취소·삭제로 합계가 0이 된 사람도 0으로 다시 쓴다)
  const summaries = summarize([...ledger.values()]);
  const empty = () => ({ bonus: 0, rewarded: 0, titles: [] });
  const metaRefs = [...touched].filter((uid) => alive.has(uid)).map((uid) => db.doc(`users/${uid}/meta/invites`));
  for (let i = 0; i < metaRefs.length; i += 100) {
    const chunk = metaRefs.slice(i, i + 100);
    const current = await db.getAll(...chunk);
    const batch = db.batch();
    let writes = 0;
    current.forEach((item, index) => {
      const uid = chunk[index].parent.parent.id;
      const next = summaries.get(uid) ?? empty();
      if (!item.exists && next.bonus === 0 && next.rewarded === 0) return; // 0이고 문서도 없으면 만들지 않는다
      const same = item.exists && item.get('bonus') === next.bonus && item.get('rewarded') === next.rewarded && JSON.stringify(item.get('titles') ?? []) === JSON.stringify(next.titles);
      if (same) return;
      batch.set(chunk[index], { ...next, updatedAt: FieldValue.serverTimestamp() });
      writes += 1;
    });
    if (writes > 0) await batch.commit();
    report.summaries += writes;
  }
  return report;
}

/** 운영자가 부정으로 본 초대의 보상을 취소한다(관리자 기록을 남긴다). 다음 실행에서 합계·지갑이 다시 계산된다 */
export async function revokeInvite({ db, inviteeUid, by = 'ops' }) {
  const ref = db.doc(`inviteLedger/${inviteeUid}`);
  const entry = await ref.get();
  if (!entry.exists) return { revoked: false, reason: '진행 기록 없음' };
  const batch = db.batch();
  batch.set(ref, { status: 'revoked', inviterPoints: 0, inviteePoints: 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.collection('adminLogs').doc(), { by, action: 'invite.revoke', target: inviteeUid, detail: `초대한 회원 ${String(entry.get('inviter')).slice(0, 6)}…의 초대 보상 취소`, at: FieldValue.serverTimestamp() });
  await batch.commit();
  return { revoked: true };
}
