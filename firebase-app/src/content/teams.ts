/**
 * KBO 10개 구단 — 구단명은 **사실 정보로 글자만** 쓴다. 로고·엠블럼은 쓰지 않는다.
 *
 * 기존 앱의 `supabase/seed.sql`(teams)과 같은 값이다. Firebase판에는 DB 시드
 * 스크립트가 따로 없어, 화면과 Firestore 문서(3단계)가 이 목록을 함께 쓴다.
 */
export interface TeamInfo {
  slug: string;
  name: string;
  shortName: string;
}

export const TEAMS: readonly TeamInfo[] = [
  { slug: 'doosan', name: '두산 베어스', shortName: '두산' },
  { slug: 'lg', name: 'LG 트윈스', shortName: 'LG' },
  { slug: 'kiwoom', name: '키움 히어로즈', shortName: '키움' },
  { slug: 'ssg', name: 'SSG 랜더스', shortName: 'SSG' },
  { slug: 'kt', name: 'KT 위즈', shortName: 'KT' },
  { slug: 'nc', name: 'NC 다이노스', shortName: 'NC' },
  { slug: 'samsung', name: '삼성 라이온즈', shortName: '삼성' },
  { slug: 'lotte', name: '롯데 자이언츠', shortName: '롯데' },
  { slug: 'kia', name: 'KIA 타이거즈', shortName: 'KIA' },
  { slug: 'hanwha', name: '한화 이글스', shortName: '한화' },
];
