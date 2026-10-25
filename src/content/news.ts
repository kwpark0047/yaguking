/**
 * 최신 소식 — **야구왕 서비스 소식**이다(업데이트·안내·이벤트).
 *
 * KBO 경기 결과·순위 같은 리그 소식은 여기 없다. koreabaseball.com은 사전
 * 서면 동의 없는 자동 수집을 금지하고(robots.txt, 이용약관 제14조), 정식
 * 이용은 데이터 라이선스 문의 중이다(12·13 문서). 라이선스가 확보되면 리그
 * 소식은 별도 출처 표기와 함께 이 페이지에 합류한다.
 *
 * 글은 운영자가 직접 쓴다. 새 글은 배열 **맨 앞에** 넣는다. 날짜는 KST.
 * 형식은 `tests/unit/content/news.test.ts`가 검사한다.
 */

export type NewsCategory = '업데이트' | '안내' | '이벤트';

export interface NewsPost {
  /** 주소에 쓰인다. 영문 소문자·숫자·하이픈 */
  slug: string;
  title: string;
  /** YYYY-MM-DD (KST) */
  date: string;
  category: NewsCategory;
  /** 목록에 보이는 한두 문장 */
  summary: string;
  /** 본문 문단 */
  body: readonly string[];
}

export const NEWS: readonly NewsPost[] = [
  {
    slug: 'new-achievement-cards-on-result',
    title: '경기가 끝나면 새 업적 카드가 짠! 하고 나타나요',
    date: '2026-10-26',
    category: '업데이트',
    summary: '이번 경기로 처음 얻은 업적 카드를 결과 화면에서 바로 보여 드려요.',
    body: [
      '경기 결과 화면의 박스스코어 아래에 "새 업적 카드" 구역이 생겼어요. 이번 경기에서 처음 조건을 채운 카드만 나타나요.',
      '이미 가진 카드를 또 채웠을 때는 나오지 않아요. 모은 카드는 마이 › 컬렉션에서 언제든 볼 수 있어요.',
      '업적 카드는 회원 기록으로 판정해요. 비회원으로 플레이한 경기도 가입하면 기록이 옮겨지면서 카드가 잡혀요.',
    ],
  },
  {
    slug: 'achievement-collection-open',
    title: '업적 카드 컬렉션이 열렸어요',
    date: '2026-10-26',
    category: '업데이트',
    summary: '첫 안타부터 명예의 전당까지, 여섯 장의 카드를 모아 보세요.',
    body: [
      '첫 안타, 첫 홈런, 5연속 정답, 사이클링 히트, 빅 이닝, 명예의 전당 입성 — 모두 여섯 장이에요.',
      '희귀한 카드일수록 테두리가 화려해져요. 사이클링 히트는 금박, 명예의 전당은 무지개 테두리의 금속판이에요.',
      '아직 못 얻은 카드도 조건은 보여 드려요. 무엇을 하면 얻는지 알아야 모으는 재미가 있으니까요.',
    ],
  },
  {
    slug: 'player-card-share',
    title: '기록 공유가 "내 선수 카드"로 바뀌었어요',
    date: '2026-10-26',
    category: '업데이트',
    summary: '공유 링크를 열면 등급에 따라 다른 소재의 선수 카드가 보여요.',
    body: [
      '공유 링크와 미리보기 이미지가 수집 카드 모양이 되었어요. 육성선수는 종이 카드, 골든글러브는 금박 카드예요.',
      '카드 가운데에는 닉네임 첫 글자가 크게 들어가요. 구단 로고나 선수 사진은 쓰지 않아요.',
      '문항과 정답은 카드에 담기지 않아요. 안심하고 자랑하세요!',
    ],
  },
  {
    slug: 'screen-style',
    title: '화면 스타일을 직접 고를 수 있어요',
    date: '2026-10-25',
    category: '업데이트',
    summary: '기본·부드러운·고대비 중에서 눈이 편한 화면을 골라 보세요.',
    body: [
      '경기 화면과 결과 화면 오른쪽 위의 "화면" 메뉴에서 바꿀 수 있어요. 회원은 설정에서도 바꿀 수 있어요.',
      '고대비는 글자를 더 또렷하게, 부드러운은 표면을 따뜻하고 둥글게 보여 줘요. 자동은 기기 설정을 따라가요.',
    ],
  },
  {
    slug: 'about-league-news',
    title: 'KBO 경기 소식은 준비 중이에요',
    date: '2026-10-26',
    category: '안내',
    summary: '경기 결과·순위는 정식 데이터 이용 허락을 받은 뒤에 보여 드릴게요.',
    body: [
      '야구왕은 KBO 공식 서비스가 아니에요. 경기 결과와 순위 같은 리그 데이터는 데이터를 관리하는 곳의 허락 없이 가져오지 않아요.',
      '지금은 정식 이용 방법을 문의하고 있어요. 허락을 받으면 출처와 함께 이 소식 페이지에서 보여 드릴게요.',
    ],
  },
];

/** 최신순(날짜 내림차순, 같은 날이면 배열 순서) */
export function latestNews(limit?: number): NewsPost[] {
  const ordered = NEWS.map((post, index) => ({ post, index }))
    .sort((a, b) => b.post.date.localeCompare(a.post.date) || a.index - b.index)
    .map(({ post }) => post);
  return limit === undefined ? ordered : ordered.slice(0, limit);
}

export function findNews(slug: string): NewsPost | undefined {
  return NEWS.find((post) => post.slug === slug);
}
