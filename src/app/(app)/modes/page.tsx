import { AppShell } from '@/components/shell/AppShell';
import { ModeList } from '@/components/modes/ModeList';

/**
 * V07 모드 선택.
 * 시작 전에 제한시간·보상·유효 랭킹 여부를 밝힌다 (08 문서 V07).
 */
export const dynamic = 'force-dynamic';

export default function ModesPage() {
  return (
    <AppShell active="play">
      <main className="flex flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-bold">어떤 경기를 할까요</h1>
        <ModeList />
      </main>
    </AppShell>
  );
}
