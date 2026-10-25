import type { Metadata } from 'next';
import { LegalPlaceholder } from '@/components/legal/LegalPlaceholder';

export const metadata: Metadata = { title: '개인정보처리방침 (확정 전) — 야구왕' };

/**
 * 개인정보처리방침 — 문안 확정 전 자리 페이지.
 *
 * 들어갈 사실 관계(수집 항목·저장 위치·삭제 경로)는 11 문서 §2.1에 정리돼 있다.
 * 보관 기간과 호스팅 리전은 아직 정해지지 않았다.
 */
export default function PrivacyPage() {
  return (
    <LegalPlaceholder
      title="개인정보처리방침"
      other={{ href: '/terms', label: '이용약관' }}
    />
  );
}
