/**
 * 팀(2단계)·팀 플레이(3단계) — 기획: 야구왕 친구 초대·팀 플레이 기획 §4~§6, 운영자 결정(2026-11-18·11-23).
 *
 * - 회원 2~9명이 만드는 팀(친구팀·동료팀·가족팀). 한 사람은 한 팀에만. 만든 사람이 감독, 코치는 합류 승인만 돕는다
 * - 합류: 팀 코드(6자리)나 팀 링크 → 합류 신청 → 감독·코치 승인. 나간 뒤 7일 동안은 다른 팀에 신청할 수 없다
 * - 팀 로고: 그림을 올리지 않고 틀·상징·색·글자를 골라 조합한다(기기가 그린다)
 * - 팀 주간 리그: 팀원이 푼 오늘의 공식전 점수(운영자 PC 채점)로 매주 순위. 팀원 상위 5명의 평균 — 인원이 많은 팀이 유리하지 않게.
 *   1~3위 팀에서 그 주에 한 번 이상 푼 팀원에게 보너스 포인트 30·20·10P(힌트에만, 월간 등수 제외)와 로고 주간 배지
 * - 팀 대항전: 친구 대결 방에서 두 팀이 같은 문제를 동시에 푼다(팀당 5명까지, 팀 평균 — 비공식, 보상 없음)
 * - 만 14세 미만 자녀는 보호자 메일 동의를 받은 계정으로 **가족팀에만** 들어온다(감독·코치는 못 함)
 *
 * 이 파일은 Firebase를 불러오지 않는다. 쓰기·읽기는 squadApi.ts, 계산은 운영자 PC ops/squad.mjs(값이 같아야 한다 — 단위 테스트).
 * 코드에서는 KBO 구단(teams.ts, favoriteTeams)과 헷갈리지 않게 'squad'라고 부르고, 화면에서는 '팀'이라고 쓴다.
 */
import { TEAMS } from '@/content/teams';

/** 처리방침 개정판 시행일 — 이날부터 팀 화면이 열린다. ops/squad.mjs와 같아야 한다(단위 테스트) */
export const SQUAD_START = '2026-12-15';

export const SQUAD_MIN = 2;
export const SQUAD_MAX = 9;
/** 팀 대항전에서 한 팀이 낼 수 있는 인원 */
export const MATCH_SIDE_MAX = 5;
/** 나간 뒤 다른 팀에 신청할 수 있기까지 — firestore.rules와 같아야 한다 */
export const SQUAD_REJOIN_DAYS = 7;

export const SQUAD_KINDS = [
  { id: 'friends', name: '친구팀', note: '친구끼리' },
  { id: 'coworkers', name: '동료팀', note: '회사·학교 동료끼리(어디인지는 묻지 않아요)' },
  { id: 'family', name: '가족팀', note: '가족끼리 — 보호자 동의를 받은 만 14세 미만 자녀도 들어올 수 있어요' },
] as const;
export type SquadKind = (typeof SQUAD_KINDS)[number]['id'];
export const isSquadKind = (value: unknown): value is SquadKind => SQUAD_KINDS.some((kind) => kind.id === value);
export const squadKindName = (kind: string) => SQUAD_KINDS.find((item) => item.id === kind)?.name ?? '팀';

/** 팀 코드 — 초대 코드와 같은 글자(헷갈리는 0·O·1·I 없음). firestore.rules의 정규식과 같아야 한다 */
export const SQUAD_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SQUAD_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function makeSquadCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) code += SQUAD_CODE_CHARS[Math.floor(random() * SQUAD_CODE_CHARS.length)]!;
  return code;
}

export const normalizeSquadCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');
export const isSquadCode = (value: unknown): value is string => typeof value === 'string' && SQUAD_CODE_PATTERN.test(value);

export const kstDate = (now: number = Date.now()) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);

/** 화면을 여는 시작일. 에뮬레이터 개발·E2E에서만 VITE_SQUAD_START로 앞당길 수 있다(inviteStart와 같은 방식) */
export function squadStart(): string {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  const override = env?.VITE_SQUAD_START;
  return env?.VITE_USE_EMULATORS !== 'false' && override ? override : SQUAD_START;
}

export const squadsOpen = (now: number = Date.now()) => kstDate(now) >= squadStart();

// ── 팀 이름 ─────────────────────────────────────────────────────────────
export const SQUAD_NAME_MIN = 2;
export const SQUAD_NAME_MAX = 12;

/** 실제 구단 이름 — 그대로 쓰거나 별칭만 쓰는 것을 막는다(‘우리동네 트윈스’ 같은 조합은 막지 않는다) */
const CLUB_WORDS = ['베어스', '트윈스', '히어로즈', '랜더스', '위즈', '다이노스', '라이온즈', '자이언츠', '타이거즈', '이글스'];
/** 비속어 — 많이 쓰는 것만. 거르지 못한 이름은 운영자가 숨긴다(admin-cli squad-hide) */
const BAD_WORDS = ['씨발', '시발', '씨바', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '존나', 'ㅈㄴ', '개새', '새끼', '좆', '썅', '느금', '니미', '애미', '애비', 'fuck', 'shit', 'bitch', 'sex', '섹스'];

const squash = (value: string) => value.toLowerCase().replace(/[\s._\-·]+/g, '');

/** 팀 이름 문제를 문장으로. 없으면 null. 규칙(firestore.rules)은 길이·'/'만 본다 — 나머지는 화면이 거르고 운영자가 숨긴다 */
export function squadNameProblem(value: string): string | null {
  const name = value.trim();
  if (name.length < SQUAD_NAME_MIN) return `팀 이름은 ${SQUAD_NAME_MIN}자 이상이에요.`;
  if (name.length > SQUAD_NAME_MAX) return `팀 이름은 ${SQUAD_NAME_MAX}자까지예요.`;
  if (name.includes('/')) return "팀 이름에 '/'는 쓸 수 없어요.";
  const squashed = squash(name);
  if (BAD_WORDS.some((word) => squashed.includes(word))) return '쓸 수 없는 말이 들어 있어요.';
  const clubs = TEAMS.flatMap((team) => [team.name, team.shortName]).map(squash);
  if (clubs.includes(squashed) || CLUB_WORDS.includes(squashed) || TEAMS.some((team) => squashed.includes(squash(team.name)))) {
    return '실제 구단 이름은 쓸 수 없어요. 우리 팀만의 이름을 지어 주세요.';
  }
  return null;
}

// ── 팀 로고 ─────────────────────────────────────────────────────────────
export const LOGO_FRAMES = [
  { id: 'shield', name: '방패' },
  { id: 'circle', name: '원' },
  { id: 'diamond', name: '다이아몬드' },
  { id: 'flag', name: '깃발' },
  { id: 'pentagon', name: '홈 플레이트' },
  { id: 'ball', name: '야구공' },
] as const;

export const LOGO_SYMBOLS = [
  { id: 'ball', name: '야구공' },
  { id: 'bats', name: '배트 두 개' },
  { id: 'crown', name: '왕관' },
  { id: 'star', name: '별' },
  { id: 'bolt', name: '번개' },
  { id: 'flame', name: '불꽃' },
  { id: 'tiger', name: '호랑이', emoji: '🐯' },
  { id: 'eagle', name: '독수리', emoji: '🦅' },
  { id: 'bear', name: '곰', emoji: '🐻' },
  { id: 'whale', name: '고래', emoji: '🐳' },
  { id: 'dragon', name: '용', emoji: '🐲' },
  { id: 'rabbit', name: '토끼', emoji: '🐰' },
] as const;

/** 팔레트 12색 — 주색(바탕)과 보조색(테두리·상징·글자)이 3:1 이상 대비인 조합만 고를 수 있다 */
export const LOGO_COLORS = [
  { id: 'navy', name: '남색', hex: '#1F2A5C' },
  { id: 'red', name: '빨강', hex: '#C8102E' },
  { id: 'blue', name: '파랑', hex: '#1565C0' },
  { id: 'green', name: '초록', hex: '#1B7F3B' },
  { id: 'black', name: '검정', hex: '#1A1A1A' },
  { id: 'purple', name: '보라', hex: '#5E35B1' },
  { id: 'brown', name: '갈색', hex: '#6D4C41' },
  { id: 'orange', name: '주황', hex: '#EF6C00' },
  { id: 'gold', name: '금색', hex: '#F2B705' },
  { id: 'sky', name: '하늘', hex: '#7CC4F2' },
  { id: 'pink', name: '분홍', hex: '#F48FB1' },
  { id: 'white', name: '흰색', hex: '#FFFFFF' },
] as const;

export type LogoFrame = (typeof LOGO_FRAMES)[number]['id'];
export type LogoSymbol = (typeof LOGO_SYMBOLS)[number]['id'];
export type LogoColor = (typeof LOGO_COLORS)[number]['id'];

export interface SquadLogo {
  frame: LogoFrame;
  symbol: LogoSymbol;
  primary: LogoColor;
  secondary: LogoColor;
  initials: string;
}

export const colorHex = (id: string) => LOGO_COLORS.find((color) => color.id === id)?.hex ?? '#1F2A5C';

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

export const LOGO_MIN_CONTRAST = 3;
export const colorsReadable = (primary: string, secondary: string) =>
  primary !== secondary && contrastRatio(colorHex(primary), colorHex(secondary)) >= LOGO_MIN_CONTRAST;

/** 이니셜: 영문 대문자·숫자 1~3자, 또는 한글 한 글자 — firestore.rules와 같아야 한다 */
export const INITIALS_PATTERN = /^([A-Z0-9]{1,3}|[가-힣])$/;
export const normalizeInitials = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

export function logoProblem(logo: SquadLogo): string | null {
  if (!LOGO_FRAMES.some((item) => item.id === logo.frame)) return '틀을 골라 주세요.';
  if (!LOGO_SYMBOLS.some((item) => item.id === logo.symbol)) return '상징을 골라 주세요.';
  if (!LOGO_COLORS.some((item) => item.id === logo.primary) || !LOGO_COLORS.some((item) => item.id === logo.secondary)) return '색을 골라 주세요.';
  if (!colorsReadable(logo.primary, logo.secondary)) return '두 색이 비슷해 잘 안 보여요. 다른 보조색을 골라 주세요.';
  if (!INITIALS_PATTERN.test(logo.initials)) return '글자는 영문·숫자 1~3자 또는 한글 한 글자예요.';
  if (BAD_WORDS.some((word) => squash(logo.initials).includes(word))) return '쓸 수 없는 글자예요.';
  return null;
}

/** 팀 이름에서 기본 이니셜(영문이면 앞 글자들, 한글이면 첫 글자) */
export function defaultInitials(name: string): string {
  const trimmed = name.trim();
  if (trimmed && /^[A-Za-z0-9\s]+$/.test(trimmed)) {
    const words = trimmed.toUpperCase().split(/\s+/).filter(Boolean);
    return words.length > 1 ? words.slice(0, 3).map((word) => word[0]).join('') : words[0]!.slice(0, 3);
  }
  const hangul = trimmed.match(/[가-힣]/);
  return hangul ? hangul[0] : 'YK';
}

export const DEFAULT_LOGO: SquadLogo = { frame: 'shield', symbol: 'ball', primary: 'navy', secondary: 'gold', initials: 'YK' };

/** 저장된 값 → 로고(모양이 어긋나면 기본값으로 채운다 — 화면이 죽지 않게) */
export function toLogo(raw: unknown): SquadLogo {
  const value = (raw ?? {}) as Partial<Record<keyof SquadLogo, unknown>>;
  const pick = <T extends string>(list: readonly { id: T }[], item: unknown, fallback: T): T =>
    list.some((entry) => entry.id === item) ? (item as T) : fallback;
  return {
    frame: pick(LOGO_FRAMES, value.frame, DEFAULT_LOGO.frame),
    symbol: pick(LOGO_SYMBOLS, value.symbol, DEFAULT_LOGO.symbol),
    primary: pick(LOGO_COLORS, value.primary, DEFAULT_LOGO.primary),
    secondary: pick(LOGO_COLORS, value.secondary, DEFAULT_LOGO.secondary),
    initials: typeof value.initials === 'string' && INITIALS_PATTERN.test(value.initials) ? value.initials : DEFAULT_LOGO.initials,
  };
}

/** 운영자가 이름을 숨긴 팀에 보이는 이름 */
export const HIDDEN_SQUAD_NAME = '이름을 가린 팀';

// ── 팀 주간 리그(3단계) ─────────────────────────────────────────────────
/** 팀 점수에 넣는 팀원 수(상위) */
export const LEAGUE_TOP = 5;
/** 1~3위 팀의 그 주 참가 팀원에게 주는 보너스 포인트 */
export const LEAGUE_REWARDS = [30, 20, 10] as const;
/** 순위표에 싣는 팀 수 */
export const LEAGUE_TABLE_MAX = 50;

/** 한국 날짜 "YYYY-MM-DD"가 든 주의 월요일 "YYYY-MM-DD" — 리그 주는 월~일 */
export function weekStartOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
}

export function weekDays(weekStart: string): string[] {
  const start = Date.parse(`${weekStart}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

/** 팀 점수 — 팀원 주간 점수 중 상위 LEAGUE_TOP명의 평균(반올림). 팀원이 그보다 적으면 있는 사람의 평균 */
export function squadScore(points: readonly number[]): number {
  const top = [...points].sort((a, b) => b - a).slice(0, LEAGUE_TOP);
  if (top.length === 0) return 0;
  return Math.round(top.reduce((sum, value) => sum + value, 0) / top.length);
}

/** 팀 대항전 — 한쪽 팀 점수는 낸 사람들 점수의 평균(인원이 달라도 공정하게) */
export function matchSideScore(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

export const dayText = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;
