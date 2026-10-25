import Link from 'next/link';

/**
 * 이용약관·개인정보처리방침의 **자리** 페이지.
 *
 * 문안은 법적 판단이라 사람이 확정한다(11 문서 §2.1). 확정 전에는 내용을
 * 지어 넣지 않고, 아직 확정되지 않았다는 사실만 분명히 밝힌다. 링크가 비어
 * 있으면 "동의한 것으로 본다"는 문장이 가리키는 문서가 아예 없게 된다.
 *
 * 문안이 확정되면 이 컴포넌트 대신 본문을 넣고 시행일을 적는다.
 */
export function LegalPlaceholder({
  title,
  other,
}: {
  title: string;
  /** 짝 문서로 가는 링크 */
  other: { href: string; label: string };
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-4 px-4 py-8">
      <Link href="/" className="flex min-h-11 items-center self-start text-sm text-ink-2 underline">
        ← 야구왕
      </Link>

      <h1 className="font-cute text-3xl">{title}</h1>

      <section
        aria-labelledby="legal-status"
        className="sticker flex flex-col gap-2 p-5"
        style={{ borderColor: 'var(--accent)' }}
      >
        <h2 id="legal-status" className="flex items-center gap-2 font-semibold">
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            확정 전
          </span>
          아직 확정되지 않은 문서입니다
        </h2>
        <p className="text-sm text-ink-2 break-keep">
          문안을 준비하고 있습니다. 확정되면 이 자리에 전문과 시행일을 게시합니다.
        </p>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-ink-2">시행일</dt>
          <dd>미정</dd>
          <dt className="text-ink-2">버전</dt>
          <dd>없음 (확정 전)</dd>
        </dl>
      </section>

      <Link href={other.href} className="flex min-h-11 items-center self-start text-sm underline">
        {other.label} 보기
      </Link>
    </main>
  );
}
