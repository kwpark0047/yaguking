import type { Metadata } from 'next';
import Link from 'next/link';
import {
  TERMS_DRAFT,
  TERMS_EFFECTIVE_DATE,
  TERMS_INTRO,
  TERMS_SECTIONS,
  TERMS_SUPPLEMENTARY,
  TERMS_VERSION,
} from '@/content/terms';

export const metadata: Metadata = {
  title: TERMS_DRAFT ? '이용약관 (초안) — 야구왕' : '이용약관 — 야구왕',
};

/**
 * 이용약관. 본문은 src/content/terms.ts, 시행일과 버전은 위 상수에서 온다.
 * `TERMS_DRAFT`이면 초안 표시를, 아니면 시행일과 버전을 맨 위에 보인다.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Link href="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>
      <h1 className="font-cute text-3xl">이용약관</h1>

      {!TERMS_DRAFT && TERMS_EFFECTIVE_DATE && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-ink-2">
          <dt className="font-semibold">시행일</dt>
          <dd>
            <time dateTime={TERMS_EFFECTIVE_DATE}>{TERMS_EFFECTIVE_DATE}</time>
          </dd>
          <dt className="font-semibold">버전</dt>
          <dd>{TERMS_VERSION}</dd>
        </dl>
      )}

      {TERMS_DRAFT && (
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
            〔 〕로 표시한 칸은 운영 주체·배포 환경이 정해지면 채웁니다.
          </p>
        </section>
      )}

      <p className="leading-relaxed break-keep">{TERMS_INTRO}</p>

      {TERMS_SECTIONS.map((section) => (
        <section key={section.id} aria-labelledby={`t-${section.id}`} className="flex flex-col gap-2">
          <h2 id={`t-${section.id}`} className="font-cute text-xl">
            {section.title}
          </h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-relaxed break-keep">
              {paragraph}
            </p>
          ))}
          {section.items && (
            <ul className="list-disc pl-5 text-sm leading-relaxed">
              {section.items.map((item) => (
                <li key={item} className="break-keep">{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="font-cute text-xl">부칙</h2>
        {TERMS_SUPPLEMENTARY.map((paragraph, index) => (
          <p key={index} className="text-sm leading-relaxed break-keep">
            {paragraph}
          </p>
        ))}
      </section>

      <Link href="/privacy" className="flex min-h-11 items-center self-start text-sm underline">
        개인정보처리방침 보기
      </Link>
    </main>
  );
}
