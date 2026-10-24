import type { Metadata, Viewport } from 'next';
import { indexingAllowed } from '@/lib/seo/indexing';
import './globals.css';

export const metadata: Metadata = {
  title: '야구왕',
  description: 'KBO 기록 퀴즈를 1이닝 경기로. 3아웃이면 박스스코어가 남습니다.',
  // 소규모 노출 동안은 색인을 막는다. robots.txt는 크롤링만 막으므로
  // 외부 링크로 들어온 URL까지 막으려면 이 메타가 함께 있어야 한다
  // (11 문서 §3).
  robots: indexingAllowed()
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 확대 차단은 접근성 위반이므로 maximumScale을 제한하지 않는다 (08 문서 §8.3)
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0C1117' },
    { media: '(prefers-color-scheme: light)', color: '#F7F8FA' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
