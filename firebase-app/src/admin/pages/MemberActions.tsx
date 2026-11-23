import { useState } from 'react';
import type { MemberViewRow } from '@/lib/admin/views';
import {
  DELETE_REASONS,
  loadMemberExtras,
  requestAccountDeletion,
  requestInviteRevoke,
  setRankingHidden,
  squadLabel,
  TASK_LABEL,
  TASK_STATUS_LABEL,
  type DeleteReason,
  type MemberExtras,
} from '../members';
import { ErrorText, field, fmtTime, line } from '../ui';

const GUARDIAN_LABEL = { none: '아님', pending: '보호자 동의 기다림', consented: '보호자 동의 받음(자녀 계정)' } as const;

/**
 * 회원 한 명 — 더 보기(지갑·초대·팀·걸린 작업, 누를 때만 읽기)와 조치.
 * 조치는 이용약관 확정 전이라 제재 없이: 월간 등수 이름 숨기기(본인 요청 대행), 초대 보상 취소(부정 의심), 계정 삭제(본인·보호자 요청,
 * 만 14세 미만 의심, 보호자 동의 거절 — 닉네임을 다시 적어야 열림). 계정 삭제·초대 취소는 운영자 PC가 처리한다(최대 하루).
 */
export function MemberActions({ row }: { row: MemberViewRow }) {
  const [extras, setExtras] = useState<MemberExtras | null>(null);
  const [hidden, setHidden] = useState(row.rankingHidden === true);
  const [reason, setReason] = useState<DeleteReason>('본인 요청');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmWord = row.nickname ?? row.uid;
  const guardian = row.guardian ?? 'none';
  const pendingDelete = extras?.tasks.some((task) => task.type === 'deleteAccount' && task.status === 'pending') ?? false;

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(done);
    } catch {
      setError('하지 못했어요. 관리자 로그인과 연결을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  const showMore = () => run(async () => setExtras(await loadMemberExtras(row.uid, row.squad ?? null)), '');

  return (
    <>
      <section aria-labelledby="more-title" className="flex flex-col gap-2">
        <h2 id="more-title" className="font-semibold">
          포인트·초대·팀
        </h2>
        <dl className="sticker grid grid-cols-1 gap-2 p-4 text-sm md:grid-cols-2">
          <div className="flex flex-col">
            <dt className="text-ink-2">만 14세 미만</dt>
            <dd>{GUARDIAN_LABEL[guardian]}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-ink-2">월간 등수 이름</dt>
            <dd>{hidden ? '숨김(익명 선수)' : '보임'}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-ink-2">초대</dt>
            <dd>
              내 코드 {row.inviteCode ?? '없음'} · 받은 코드 {row.invitedBy ?? '없음'}
            </dd>
          </div>
          {extras && (
            <>
              <div className="flex flex-col">
                <dt className="text-ink-2">힌트 포인트(지갑)</dt>
                <dd>{extras.wallet ? `모은 ${extras.wallet.earned}P · 쓴 ${extras.wallet.spent}P · 남은 ${extras.wallet.earned - extras.wallet.spent}P` : '지갑 없음'}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-ink-2">보너스 포인트</dt>
                <dd>
                  초대 {extras.inviteBonus}P(보상받은 친구 {extras.invitesRewarded}명, 초대한 사람 {extras.invitedCount}명) · 팀 {extras.squadBonus}P
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-ink-2">팀</dt>
                <dd>{extras.squad ? squadLabel(extras.squad) : '없음'}</dd>
              </div>
            </>
          )}
        </dl>
        {!extras && (
          <button type="button" disabled={busy} onClick={() => void showMore()} className="min-h-11 self-start rounded-option border-2 px-4 text-sm font-semibold" style={line}>
            지갑·보너스·팀·작업 보기(읽기 약 7, 관리자 기록)
          </button>
        )}
        {extras && extras.tasks.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm" aria-label="이 회원에게 걸린 작업">
            {extras.tasks.map((task) => (
              <li key={task.id}>
                {fmtTime(task.requestedAt)} · {TASK_LABEL[task.type] ?? task.type}
                {task.detail && `(${task.detail})`} · {TASK_STATUS_LABEL[task.status] ?? task.status}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="actions-title" className="flex flex-col gap-3">
        <h2 id="actions-title" className="font-semibold">
          조치
        </h2>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {error && <ErrorText>{error}</ErrorText>}

        <div className="sticker flex flex-col gap-2 p-4 text-sm">
          <p className="font-semibold">월간 등수 이름 {hidden ? '보이기' : '숨기기'}</p>
          <p className="text-ink-2 break-keep">본인이 요청했을 때 대신 바꿔요(앱 설정에서도 본인이 바꿀 수 있어요). 다음 0시 등수부터 적용돼요.</p>
          <button
            type="button"
            disabled={busy || (!row.ageConfirmedAt && guardian !== 'consented')}
            onClick={() => void run(async () => {
              await setRankingHidden(row.uid, !hidden);
              setHidden(!hidden);
            }, hidden ? '월간 등수에 이름을 다시 보여요.' : '월간 등수에서 이름을 숨겼어요(익명 선수).')}
            className="min-h-11 self-start rounded-option border-2 px-4 font-semibold disabled:opacity-60"
            style={line}
          >
            {hidden ? '이름 보이기' : '이름 숨기기'}
          </button>
        </div>

        {row.invitedBy && (
          <div className="sticker flex flex-col gap-2 p-4 text-sm">
            <p className="font-semibold">초대 보상 취소</p>
            <p className="text-ink-2 break-keep">
              이 회원이 받은 초대({row.invitedBy})를 부정으로 볼 때 두 사람의 보상을 취소해요. 운영자 PC가 처리하고 다음 0시에 합계·지갑이 다시 계산돼요.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => requestInviteRevoke(row.uid), '초대 보상 취소를 요청했어요(운영자 PC가 처리).')}
              className="min-h-11 self-start rounded-option border-2 px-4 font-semibold disabled:opacity-60"
              style={line}
            >
              초대 보상 취소 요청
            </button>
          </div>
        )}

        <form
          className="sticker flex flex-col gap-2 p-4 text-sm"
          aria-labelledby="delete-title"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirm.trim() !== confirmWord) return;
            void run(() => requestAccountDeletion(row.uid, reason), '계정 삭제를 요청했어요. 운영자 PC가 처리하면 로그인 계정과 모든 기록이 지워져요(되돌릴 수 없음).').then(() =>
              setConfirm(''),
            );
          }}
        >
          <p id="delete-title" className="font-semibold" style={{ color: 'var(--out)' }}>
            계정 삭제
          </p>
          <p className="text-ink-2 break-keep">
            이용약관이 확정되기 전이라 아래 사유만 받아요. 운영자 PC가 기록·팀 자리·닉네임·초대 코드·로그인 계정을 지우고, 되돌릴 수 없어요. 관리자 계정은 지우지 않아요.
          </p>
          <label className="flex flex-col gap-1">
            사유
            <select value={reason} onChange={(event) => setReason(event.target.value as DeleteReason)} className="min-h-11 rounded-option border px-2" style={field}>
              {DELETE_REASONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            확인을 위해 {row.nickname ? '닉네임' : 'uid'} “{confirmWord}”을(를) 적어 주세요
            <input value={confirm} onChange={(event) => setConfirm(event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
          <button
            type="submit"
            disabled={busy || confirm.trim() !== confirmWord || pendingDelete || row.admin}
            className="min-h-11 self-start rounded-option border-2 px-4 font-semibold disabled:opacity-60"
            style={{ borderColor: 'var(--out)', color: 'var(--out)' }}
          >
            {pendingDelete ? '삭제 처리 기다리는 중' : '계정 삭제 요청'}
          </button>
          {row.admin && <p className="text-xs text-ink-2">관리자 계정은 여기서 지울 수 없어요.</p>}
        </form>
      </section>
    </>
  );
}
