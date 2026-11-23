import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { maskEmail } from '@/lib/admin/access';
import { GUARDIAN_WAIT_DAYS, guardianConsentEmail } from '@/lib/auth/guardian';
import {
  approveGuardianRequest,
  GuardianApproveError,
  guardianApproveProblem,
  loadGuardianRequests,
  requestAccountDeletion,
  type GuardianRequest,
} from '../members';
import { ErrorText, PageTitle, field, fmtTime, line, primary } from '../ui';

/**
 * 보호자 동의(만 14세 미만 자녀 계정, src/lib/auth/guardian.ts) — 동의를 기다리는 계정 목록과 승인.
 * 받은 동의 메일의 **보낸 주소**와 메일 제목의 동의 코드를 적으면, 자녀가 적은 보호자 주소와 같고 7일 안일 때만 승인한다.
 * 거절하면 계정 삭제(사유 '보호자 동의 거절')를 운영자 PC에 요청한다. 열 때 관리자 기록. 보호자 주소는 가려서 보인다.
 */
export function GuardiansPage() {
  const [rows, setRows] = useState<GuardianRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const consentMail = guardianConsentEmail();

  async function reload() {
    setError(null);
    try {
      setRows(await loadGuardianRequests());
    } catch {
      setError('불러오지 못했어요. 관리자 로그인과 연결을 확인해 주세요.');
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  return (
    <>
      <PageTitle note={`받는 곳: ${consentMail ?? '동의 메일 주소가 아직 정해지지 않았어요(자녀 가입 길이 닫혀 있어요)'} · 기한 ${GUARDIAN_WAIT_DAYS}일 — 지나면 0시 작업이 계정을 지워요.`}>
        보호자 동의
      </PageTitle>
      {error && <ErrorText>{error}</ErrorText>}
      {rows === null && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-ink-2">동의를 기다리는 계정이 없어요.</p>}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col gap-3" aria-label="보호자 동의 기다림">
          {rows.map((row) => (
            <GuardianLine key={row.uid} row={row} onDone={() => void reload()} />
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-2 break-keep">
        승인한 뒤에는 보호자에게 확인 메일로 답해 주세요. 자녀는 앱에서 “동의됐는지 확인하기”를 누르면 열려요.
      </p>
    </>
  );
}

function GuardianLine({ row, onDone }: { row: GuardianRequest; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [sender, setSender] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expired = Date.now() > row.deadline;
  const problem = code || sender ? guardianApproveProblem(row, { code, senderEmail: sender }, Date.now()) : null;

  async function act(action: () => Promise<void>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMessage(done);
      onDone();
    } catch (caught) {
      setError(caught instanceof GuardianApproveError ? caught.message : '하지 못했어요. 다시 해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="sticker flex flex-col gap-2 p-4 text-sm">
      <p className="flex flex-wrap gap-x-3 gap-y-1">
        <span className="font-cute text-xl tracking-widest">{row.code}</span>
        <span>신청 {fmtTime(row.requestedAt)}</span>
        <span style={expired ? { color: 'var(--out)' } : undefined}>기한 {fmtTime(row.deadline)}</span>
        <span>보호자 {maskEmail(row.email)}</span>
        <Link to={`/members/${row.uid}`} className="underline">
          회원 보기
        </Link>
      </p>
      {message && <p role="status">{message}</p>}
      {error && <ErrorText>{error}</ErrorText>}
      <form
        className="grid grid-cols-1 gap-2 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          void act(() => approveGuardianRequest(row, { code, senderEmail: sender }), '승인했어요. 보호자에게 확인 메일로 답해 주세요.');
        }}
      >
        <label className="flex flex-col gap-1">
          메일 제목의 동의 코드
          <input value={code} onChange={(event) => setCode(event.target.value)} maxLength={8} className="min-h-11 rounded-option border px-3 tracking-widest" style={field} />
        </label>
        <label className="flex flex-col gap-1">
          받은 메일의 보낸 주소
          <input type="email" value={sender} onChange={(event) => setSender(event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
        </label>
        <button type="submit" disabled={busy || !code || !sender || !!problem} className="min-h-11 self-end rounded-option px-4 font-semibold disabled:opacity-60" style={primary}>
          동의 승인
        </button>
      </form>
      {problem && <p className="text-xs text-ink-2">{problem}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void act(() => requestAccountDeletion(row.uid, '보호자 동의 거절'), '거절했어요 — 계정 삭제를 운영자 PC에 요청했어요.')}
        className="min-h-11 self-start rounded-option border-2 px-4 font-semibold"
        style={{ ...line, color: 'var(--out)' }}
      >
        거절하고 계정 삭제 요청
      </button>
    </li>
  );
}
