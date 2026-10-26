import { Link } from 'react-router';
import {
  PRIVACY_DRAFT,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
  type PolicySection,
} from '@/content/privacy';

const badge = { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' };

/**
 * 이용약관·개인정보처리방침.
 *
 * - 처리방침: Firebase판 **초안**(src/content/privacy.ts). 확정 전이라는 표시를 맨 위에 둔다
 * - 이용약관: 문안이 정해진 적이 없다(기존 앱도 자리 페이지) — 내용을 지어 넣지 않고 확정 전이라고만 밝힌다
 */
export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const title = kind === 'terms' ? '이용약관' : '개인정보처리방침';
  const other =
    kind === 'terms'
      ? { to: '/privacy', label: '개인정보처리방침' }
      : { to: '/terms', label: '이용약관' };

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Link to="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">{title}</h1>

      {kind === 'terms' ? (
        <section aria-labelledby="legal-status" className="sticker flex flex-col gap-2 p-5">
          <h2 id="legal-status" className="flex items-center gap-2 font-semibold">
            <span className="rounded-full px-2 py-0.5 text-xs" style={badge}>
              확정 전
            </span>
            이용약관을 준비하고 있어요
          </h2>
          <p className="text-sm text-ink-2 break-keep">확정되면 이 자리에 전문과 시행일을 게시합니다.</p>
        </section>
      ) : (
        <>
          {PRIVACY_DRAFT && (
            <p role="note" className="sticker flex flex-wrap items-center gap-2 p-4 text-sm break-keep">
              <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={badge}>
                초안
              </span>
              배포 전에 확정할 Firebase판 초안이에요. 시행일: {PRIVACY_EFFECTIVE_DATE ?? '확정 전'}
            </p>
          )}
          <p className="text-sm leading-relaxed break-keep">{PRIVACY_INTRO}</p>
          {PRIVACY_SECTIONS.map((section) => (
            <Section key={section.id} section={section} />
          ))}
        </>
      )}

      <Link to={other.to} className="flex min-h-11 items-center self-start text-sm underline">
        {other.label} 보기
      </Link>
    </main>
  );
}

function Section({ section }: { section: PolicySection }) {
  return (
    <section aria-labelledby={`privacy-${section.id}`} className="flex flex-col gap-2">
      <h2 id={`privacy-${section.id}`} className="text-lg font-semibold">
        {section.title}
      </h2>
      {section.lead && <p className="text-sm leading-relaxed break-keep">{section.lead}</p>}
      {section.table && (
        // 좁은 화면에서 가로로 넘기는 표 — 키보드로도 넘길 수 있게 초점을 받는다
        <div className="overflow-x-auto rounded-sm" tabIndex={0} role="region" aria-label={`${section.title} 표`}>
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <thead>
              <tr>
                {section.table.head.map((cell) => (
                  <th key={cell} scope="col" className="border-b-2 px-2 py-2 font-semibold" style={{ borderColor: 'var(--line)' }}>
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) =>
                    index === 0 ? (
                      <th key={index} scope="row" className="border-b px-2 py-2 align-top font-medium break-keep" style={{ borderColor: 'var(--line)' }}>
                        {cell}
                      </th>
                    ) : (
                      <td key={index} className="border-b px-2 py-2 align-top break-keep" style={{ borderColor: 'var(--line)' }}>
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph} className="text-sm leading-relaxed break-keep">
          {paragraph}
        </p>
      ))}
      {section.items && (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed break-keep">
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
