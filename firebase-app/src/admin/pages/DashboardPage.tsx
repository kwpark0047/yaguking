import { useCallback, useEffect, useState } from 'react';
import { loadDashboard, requestAccountSync, type DashboardNumbers } from '../data';
import { ErrorText, PageTitle, StatCard, fmtTime, line } from '../ui';

/**
 * 대시보드 — 숫자는 실시간이 아니다: 개수 세기(count)는 연 순간, 비회원 수는 운영자 PC 동기화 시각 기준.
 * 화면 한 번에 읽기 약 6(세기는 1,000건당 1읽기). docs/admin-plan.md §5.1
 */
export function DashboardPage() {
  const [numbers, setNumbers] = useState<DashboardNumbers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setError(null);
    loadDashboard()
      .then(setNumbers)
      .catch(() => setError('숫자를 불러오지 못했어요.'));
  }, []);

  useEffect(refresh, [refresh]);

  async function sync() {
    setNotice(null);
    try {
      await requestAccountSync();
      setNotice('동기화를 요청했어요. 운영자 PC 작업이 처리합니다(매일 03:30, 또는 PC에서 바로 실행).');
      refresh();
    } catch {
      setError('요청하지 못했어요.');
    }
  }

  return (
    <>
      <PageTitle note={numbers ? `개수는 ${fmtTime(numbers.countedAt)}에 셈 · 비회원 수는 ${fmtTime(numbers.syncedAt)} 동기화 기준` : undefined}>
        대시보드
      </PageTitle>
      {error && <ErrorText>{error}</ErrorText>}
      {!numbers && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {numbers && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatCard label="회원" value={numbers.members} hint="만 14세 확인을 마친 회원(프로필 있음)" />
          <StatCard label="오늘 가입" value={numbers.signupsToday} hint="한국 시간 0시부터" />
          <StatCard label="오늘 경기" value={numbers.gamesToday} hint="비회원·회원, 레벨 테스트 포함(비공식)" />
          <StatCard
            label="비회원"
            value={numbers.guests ?? '—'}
            hint={numbers.guests === null ? '아직 동기화 전' : `최근 7일 활동 ${numbers.guestsActive7d}`}
          />
          <StatCard label="대결 방" value={numbers.rooms} hint="24시간 지나면 정리 작업이 지움" />
          <StatCard label="처리 대기 작업" value={numbers.pendingTasks} hint="운영자 PC 작업이 처리" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={refresh} className="min-h-11 rounded-option border-2 px-4 text-sm font-semibold" style={line}>
          다시 세기
        </button>
        <button type="button" onClick={() => void sync()} className="min-h-11 rounded-option border-2 px-4 text-sm font-semibold" style={line}>
          계정 동기화 요청
        </button>
      </div>
      {notice && (
        <p role="status" className="text-sm break-keep">
          {notice}
        </p>
      )}
      <p className="text-xs text-ink-2 break-keep">
        실제 무료 사용량은 Firebase 콘솔 › 사용량에서 확인하세요. 점수·경기 수는 기기에서 채점한 비공식 기록입니다.
      </p>
    </>
  );
}
