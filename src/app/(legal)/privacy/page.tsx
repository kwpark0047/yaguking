import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PRIVACY_DRAFT,
  PRIVACY_EFFECTIVE_DATE,
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
} from '@/content/privacy';

export const metadata: Metadata = { title: '개인정보처리방침 (초안) — 야구왕' };

/**
 * 개인정보처리방침 — **초안**(법률 검토 전). 본문은 src/content/privacy.ts,
 * 보관 기간은 src/lib/privacy/retention.ts(파기는 0016 DB 함수)에서 온다.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Link href="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">개인정보처리방침</h1>

      {PRIVACY_DRAFT && (
        <section aria-labelledby="legal-status" className="sticker flex flex-col gap-2 p-5">
          <h2 id="legal-status" className="flex items-center gap-2 font-semibold">
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              확정 전
            </span>
            초안입니다 — 법률 검토 전
          </h2>
          <p className="text-sm text-ink-2 break-keep">
            〔 〕로 표시한 칸은 운영 주체·배포 환경이 정해지면 채웁니다. 시행일:{' '}
            {PRIVACY_EFFECTIVE_DATE ?? '미정'}
          </p>
        </section>
      )}

      <p className="leading-relaxed break-keep">{PRIVACY_INTRO}</p>

      {PRIVACY_SECTIONS.map((section) => (
        <section key={section.id} aria-labelledby={`p-${section.id}`} className="flex flex-col gap-2">
          <h2 id={`p-${section.id}`} className="font-cute text-xl">
            {section.title}
          </h2>
          {section.table && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {section.table.head.map((cell) => (
                      <th key={cell} scope="col" className="border-b p-2 text-left" style={{ borderColor: 'var(--line)' }}>
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.table.rows.map((row) => (
                    <tr key={row.join('|')}>
                      {row.map((cell, index) => (
                        <td key={index} className="border-b p-2 align-top break-keep" style={{ borderColor: 'var(--line)' }}>
                          {cell}
                        </td>
                      ))}
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
            <ul className="list-disc pl-5 text-sm leading-relaxed">
              {section.items.map((item) => (
                <li key={item} className="break-keep">
                  {item}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <Link href="/terms" className="flex min-h-11 items-center self-start text-sm underline">
        이용약관 보기
      </Link>
    </main>
  );
}
