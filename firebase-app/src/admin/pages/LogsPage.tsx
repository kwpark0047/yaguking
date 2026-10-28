import { useView, ViewBar } from '../useView';
import { rebuildLogs, type LogsView } from '../views';
import { PageTitle, fmtTime, line } from '../ui';

const ACTION_LABEL: Record<string, string> = {
  'view-member': '회원 열람',
  'view-members': '가입자 목록 열람',
  'view-signups': '가입 확인 열람',
  'view-member-games': '회원 경기 열람',
  'view-games': '오늘 경기 열람',
  'view-rooms': '대결 방 열람',
  'view-email': '이메일 보기',
  'build-view': '화면 새로 만들기',
  'cleanup-rooms': '지난 방 정리',
  'request-sync': '계정 동기화 요청',
  'create-notice': '공지 올림',
  'update-notice': '공지 고침',
  'delete-notice': '공지 지움',
  'set-double-days': '출석 2배 날 저장',
};

/** 관리자 기록 — 개인정보 접속기록. 고치거나 지울 수 없다(규칙). 2년 보관. 열 때 보기 하나(읽기 1) */
export function LogsPage() {
  const { view, busy, error, refresh } = useView<LogsView>('logs', rebuildLogs);
  const logs = view?.data.logs ?? (view === null ? [] : null);

  return (
    <>
      <PageTitle note="최근 100건. 개인정보 접속기록이라 2년 보관하고, 고치거나 지울 수 없습니다.">관리자 기록</PageTitle>
      <ViewBar updatedAt={view?.updatedAt ?? null} busy={busy} error={error} onRefresh={() => void refresh()} cost="기록 최근 100건을 읽습니다" />
      {view === undefined && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {logs && logs.length === 0 && <p className="text-sm text-ink-2">아직 기록이 없어요.</p>}
      {logs && logs.length > 0 && (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="관리자 기록">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                {['시각', '한 일', '대상', '내용'].map((head) => (
                  <th key={head} scope="col" className="border-b-2 px-2 py-2" style={line}>
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <th scope="row" className="num-tabular border-b px-2 py-2 font-normal" style={line}>
                    {fmtTime(log.at)}
                  </th>
                  <td className="border-b px-2 py-2" style={line}>{ACTION_LABEL[log.action] ?? log.action}</td>
                  <td className="break-all border-b px-2 py-2" style={line}>{log.target}</td>
                  <td className="border-b px-2 py-2" style={line}>{log.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
