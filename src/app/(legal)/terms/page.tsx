import type { Metadata } from 'next';
import { LegalPlaceholder } from '@/components/legal/LegalPlaceholder';

export const metadata: Metadata = { title: '이용약관 (확정 전) — 야구왕' };

/** 이용약관 — 문안 확정 전 자리 페이지 (11 문서 §2.1) */
export default function TermsPage() {
  return (
    <LegalPlaceholder
      title="이용약관"
      other={{ href: '/privacy', label: '개인정보처리방침' }}
    />
  );
}
