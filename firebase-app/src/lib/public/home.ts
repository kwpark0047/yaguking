import { usingEmulators } from '@/lib/env';
import { countReads } from '@/lib/firebase/meter';
import type { PublicNotice } from '@/lib/admin/notices';

/**
 * 공개 묶음(`public/home`) 읽기 — 관리자가 올린 공지(나중에 이벤트·광고도). docs/admin-plan.md §4
 *
 * **Firestore SDK 없이** REST로 읽는다: 첫 방문(비회원) 메인이 SDK(압축 약 160 KB)를 내려받지 않게
 * (Hosting 전송량). 규칙이 누구나 읽기를 허락한다. 앱을 연 동안 메모리에 10분 기억해 다시 읽지 않는다(앱 열기당 읽기 1).
 * 기기 저장소에는 남기지 않는다 — 처리방침의 기기 저장 항목이 늘지 않게.
 */
const CACHE_MS = 10 * 60 * 1000;

export interface PublicHome {
  notices: PublicNotice[];
}

const EMPTY: PublicHome = { notices: [] };

function documentUrl(): string {
  const project = usingEmulators ? 'demo-yaguking' : import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const host = usingEmulators ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com';
  return `${host}/v1/projects/${project}/databases/(default)/documents/public/home`;
}

/** Firestore REST 값 → JS 값(이 문서에 쓰는 형만) */
type RestValue = {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  timestampValue?: string;
  nullValue?: null;
  arrayValue?: { values?: RestValue[] };
  mapValue?: { fields?: Record<string, RestValue> };
};

function decode(value: RestValue | undefined): unknown {
  if (!value) return undefined;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('timestampValue' in value) return Date.parse(value.timestampValue!);
  if ('nullValue' in value) return null;
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decode);
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decode(item)]));
  return undefined;
}

/** REST 응답 문서 → 공개 묶음. 모양이 틀린 공지는 버린다 */
export function parsePublicHome(document: { fields?: Record<string, RestValue> } | null): PublicHome {
  const raw = decode({ mapValue: { fields: document?.fields ?? {} } }) as { notices?: unknown };
  const notices = Array.isArray(raw.notices) ? raw.notices : [];
  return {
    notices: notices.flatMap((item): PublicNotice[] => {
      const notice = item as Record<string, unknown>;
      if (typeof notice.id !== 'string' || typeof notice.title !== 'string' || typeof notice.startsAt !== 'number') return [];
      return [
        {
          id: notice.id,
          title: notice.title,
          body: typeof notice.body === 'string' ? notice.body : '',
          startsAt: notice.startsAt,
          endsAt: typeof notice.endsAt === 'number' ? notice.endsAt : null,
          pinned: notice.pinned === true,
        },
      ];
    }),
  };
}

let memory: { at: number; home: PublicHome } | null = null;

function cached(): PublicHome | null {
  return memory && Date.now() - memory.at < CACHE_MS ? memory.home : null;
}

let inFlight: Promise<PublicHome> | null = null;

/** 공개 묶음. 실패하면 빈 묶음(공지가 없어도 앱은 돈다) */
export function loadPublicHome(): Promise<PublicHome> {
  const hit = cached();
  if (hit) return Promise.resolve(hit);
  inFlight ??= fetch(documentUrl())
    .then(async (response) => {
      countReads('publicHome', 1);
      if (response.status === 404) return EMPTY;
      if (!response.ok) throw new Error(String(response.status));
      return parsePublicHome((await response.json()) as { fields?: Record<string, RestValue> });
    })
    .then((home) => {
      memory = { at: Date.now(), home };
      return home;
    })
    .catch(() => EMPTY)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
