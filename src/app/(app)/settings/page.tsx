import { redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { SettingsClient } from '@/components/settings/SettingsClient';
import { getAuthUserId } from '@/lib/supabase/server';
import { teamThemesEnabled } from '@/lib/theme/themeSwitch';
import { getStylePreference } from '@/server/theme/style';

/** V17 설정. */
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const userId = await getAuthUserId();
  if (!userId) redirect('/auth?returnTo=/settings');
  const stylePreference = await getStylePreference();

  return (
    <AppShell active="me">
      <main className="flex flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-bold">설정</h1>
        <SettingsClient
          teamThemes={teamThemesEnabled()}
          stylePreference={stylePreference}
        />
      </main>
    </AppShell>
  );
}
