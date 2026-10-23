import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '야구왕',
  description: 'KBO 기록 퀴즈를 1이닝 경기로. 3아웃이면 박스스코어가 남습니다.',
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
