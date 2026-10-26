import type { Difficulty } from '@/lib/engine';

/**
 * 문제은행 — 정적 JSON(scripts/build-questions.mjs가 data/*.csv에서 만든다).
 *
 * Firestore에 두지 않는다: 문항을 볼 때 무료 읽기 한도를 쓰지 않는다. 정답(`correct`)이
 * 기기로 내려가므로 이 문항으로 하는 경기는 **비공식**이다.
 *
 * 앱 첫 화면 묶음에 넣지 않으려고 경기를 시작할 때 불러온다(압축 약 42 KB).
 */
export type CategorySlug = 'history' | 'player-stats' | 'team-history' | 'korean-series' | 'rules';
export type OptionLabel = 'A' | 'B' | 'C' | 'D';

export interface Question {
  /** `q` + 본문 해시 12자리. 오답노트·경기 기록이 가리킨다 */
  id: string;
  category: CategorySlug;
  difficulty: Difficulty;
  recordAsOf: string;
  seasonScope?: string;
  stem: string;
  options: { label: OptionLabel; text: string }[];
  correct: OptionLabel;
  explanation?: string;
  source: { name: string; url?: string; verifiedAt: string };
}

export const CATEGORY_TITLE: Record<CategorySlug, string> = {
  history: 'KBO 역사',
  'player-stats': '선수 기록',
  'team-history': '구단 역사',
  'korean-series': '한국시리즈',
  rules: '야구 규칙·상식',
};

let cache: Promise<Question[]> | null = null;

export function loadQuestions(): Promise<Question[]> {
  cache ??= import('./questions.generated.json').then((module) => module.default as Question[]);
  return cache;
}
