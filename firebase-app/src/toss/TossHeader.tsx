import { Link } from 'react-router';

/** 미니앱판 머리줄(공지·소식·처리방침 화면) — 로고만. 뒤로 가기는 토스 내비게이션 바가 맡는다 */
export function SiteHeader() {
  return (
    <header className="flex items-center">
      <Link to="/" className="font-cute flex min-h-11 items-center gap-1 text-2xl">
        <span aria-hidden="true">⚾</span>
        야구왕
      </Link>
    </header>
  );
}
