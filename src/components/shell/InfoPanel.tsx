import { AtBatLog } from '@/components/game/AtBatLog';
import type { AtBatLogEntryDto } from '@/types/api';

/**
 * lg 우측 정보 패널.
 *
 * **읽기 전용이다.** 경기 입력 옆에 클릭 가능한 요소를 두면 오조작이 난다
 * (08 문서 §6.4). 팬 페넌트레이스와 고스트 진행은 P2에서 채워진다.
 */
export function InfoPanel({ entries }: { entries: AtBatLogEntryDto[] }) {
  return (
    <aside
      className="flex flex-col gap-4"
      aria-label="경기 정보"
    >
      <section className="rounded-card border p-4" style={{ borderColor: 'var(--line)' }}>
        <h2 className="mb-2 text-sm font-semibold">타석 로그</h2>
        <AtBatLog entries={entries} />
      </section>

      <section
        className="rounded-card border border-dashed p-4"
        style={{ borderColor: 'var(--line)' }}
      >
        <h2 className="mb-1 text-sm font-semibold text-ink-2">오늘의 팬 리그</h2>
        <p className="text-xs text-ink-2">
          구단 대항 집계는 P2에서 시작합니다. 지금은 개인 기록만 쌓입니다.
        </p>
      </section>
    </aside>
  );
}
