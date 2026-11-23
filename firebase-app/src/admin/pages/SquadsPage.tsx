import { useEffect, useState } from 'react';
import { SquadLogo } from '@/components/squad/SquadLogo';
import { HIDDEN_SQUAD_NAME, squadKindName } from '@/lib/squad/squad';
import { loadSquads, setSquadHidden, type SquadRow } from '../members';
import { ErrorText, PageTitle, field, fmtTime, line } from '../ui';

/**
 * 팀(2단계) — 팀 목록(코드·이름·종류·인원·배지)과 이름 숨기기·보이기(비속어·사칭·실제 구단 흉내).
 * 숨긴 팀은 이용자에게 '이름을 가린 팀'으로 보이고, 감독이 이름을 바꿔도 숨김은 그대로다. 열 때 읽기 = 팀 수.
 */
export function SquadsPage() {
  const [rows, setRows] = useState<SquadRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    setError(null);
    try {
      setRows(await loadSquads());
    } catch {
      setError('불러오지 못했어요. 관리자 로그인과 연결을 확인해 주세요.');
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function toggle(row: SquadRow) {
    setBusy(row.code);
    setError(null);
    try {
      await setSquadHidden(row, !row.hidden);
      await reload();
    } catch {
      setError('바꾸지 못했어요. 다시 해 주세요.');
    } finally {
      setBusy(null);
    }
  }

  const query = search.trim().toLowerCase();
  const shown = (rows ?? []).filter((row) => !query || row.name.toLowerCase().includes(query) || row.code.toLowerCase().includes(query.toUpperCase().toLowerCase()));

  return (
    <>
      <PageTitle note={`숨기면 이용자에게 '${HIDDEN_SQUAD_NAME}'으로 보여요. 숨기기·보이기는 관리자 기록에 남아요.`}>팀</PageTitle>
      {error && <ErrorText>{error}</ErrorText>}
      {rows === null && !error && <p className="text-sm text-ink-2">불러오는 중…</p>}
      {rows && (
        <>
          <label className="flex max-w-sm flex-col gap-1 text-sm">
            팀 이름·코드 찾기
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="min-h-11 rounded-option border px-3" style={field} />
          </label>
          <p className="text-sm text-ink-2" role="status">
            {shown.length}팀 / 모두 {rows.length}팀
          </p>
          {shown.length === 0 ? (
            <p className="text-sm text-ink-2">팀이 없어요.</p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="팀 목록">
              {shown.map((row) => (
                <li key={row.code} className="sticker flex flex-wrap items-center gap-3 p-3 text-sm">
                  <SquadLogo logo={row.logo} size={44} badge={row.badge} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">
                      {row.name}
                      {row.hidden && <span className="text-ink-2"> (이름 숨김)</span>}
                    </span>
                    <span className="text-ink-2">
                      {row.code} · {squadKindName(row.kind)} · {row.size}명 · 만든 날 {fmtTime(row.createdAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy === row.code}
                    onClick={() => void toggle(row)}
                    className="min-h-11 rounded-option border-2 px-3 font-semibold disabled:opacity-60"
                    style={line}
                  >
                    {row.hidden ? '이름 보이기' : '이름 숨기기'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
