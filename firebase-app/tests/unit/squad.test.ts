import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  colorsReadable,
  contrastRatio,
  colorHex,
  defaultInitials,
  isSquadCode,
  LEAGUE_REWARDS,
  LEAGUE_TABLE_MAX,
  LEAGUE_TOP,
  LOGO_COLORS,
  LOGO_FRAMES,
  LOGO_SYMBOLS,
  logoProblem,
  makeSquadCode,
  matchSideScore,
  normalizeSquadCode,
  SQUAD_CODE_CHARS,
  SQUAD_MAX,
  SQUAD_START,
  squadNameProblem,
  squadScore,
  toLogo,
  weekDays,
  weekStartOf,
  DEFAULT_LOGO,
} from '@/lib/squad/squad';
import { nextCaptain, rejoinBlockedUntil } from '@/lib/squad/squadApi';
import { GUARDIAN_CODE_PATTERN, GUARDIAN_START, GUARDIAN_WAIT_DAYS, guardianMail, guardianMailto, guardianSignupOpen, isGuardianEmail } from '@/lib/auth/guardian';
import { PRIVACY_VERSIONS, SQUAD_PRIVACY_EFFECTIVE, INVITE_PRIVACY_EFFECTIVE } from '@/content/privacy';
import * as ops from '../../ops/squad.mjs';
import * as guardianOps from '../../ops/guardian.mjs';

const rules = readFileSync(resolve(__dirname, '../../firestore.rules'), 'utf8');
const kst = (day: string) => Date.parse(`${day}T00:00:00+09:00`);

describe('팀 — 앱·운영자 PC·규칙·처리방침이 같은 값', () => {
  it('시작일·인원·리그 값이 운영자 PC와 같다', () => {
    expect(ops.SQUAD_START).toBe(SQUAD_START);
    expect(ops.SQUAD_MAX).toBe(SQUAD_MAX);
    expect(ops.LEAGUE_TOP).toBe(LEAGUE_TOP);
    expect([...ops.LEAGUE_REWARDS]).toEqual([...LEAGUE_REWARDS]);
    expect(ops.LEAGUE_TABLE_MAX).toBe(LEAGUE_TABLE_MAX);
    expect(guardianOps.GUARDIAN_WAIT_DAYS).toBe(GUARDIAN_WAIT_DAYS);
    expect(guardianOps.GUARDIAN_VERSION).toBe(SQUAD_START);
    expect(GUARDIAN_START).toBe(SQUAD_START);
  });

  it('규칙의 최대 인원·코드 정규식·로고 목록이 앱과 같다', () => {
    expect(rules).toContain('request.resource.data.size <= 9');
    expect(rules).toContain("get(squadDoc(code)).data.size < 9");
    expect(rules).toContain("'^[A-HJ-NP-Z2-9]{6}$'");
    expect(rules).toContain(`logo.frame in [${LOGO_FRAMES.map((item) => `'${item.id}'`).join(', ')}]`);
    expect(rules).toContain(`logo.symbol in [${LOGO_SYMBOLS.map((item) => `'${item.id}'`).join(', ')}]`);
    expect(rules).toContain(`logo.primary in [${LOGO_COLORS.map((item) => `'${item.id}'`).join(', ')}]`);
    expect(rules).toContain("'^([A-Z0-9]{1,3}|[가-힣])$'");
    expect(rules).toContain("duration.value(7, 'd'))");
  });

  it('처리방침 팀 판 = 팀을 여는 날, 초대 판 다음 판, 오늘(11-23) 기준 7일 뒤 이상', () => {
    expect(SQUAD_PRIVACY_EFFECTIVE).toBe(SQUAD_START);
    expect(kst(SQUAD_START) - kst('2026-11-23')).toBeGreaterThanOrEqual(7 * 86_400_000);
    const at = PRIVACY_VERSIONS.findIndex((version) => version.effective === SQUAD_START);
    expect(PRIVACY_VERSIONS[at - 1]!.effective).toBe(INVITE_PRIVACY_EFFECTIVE);
    const version = PRIVACY_VERSIONS[at]!;
    const before = PRIVACY_VERSIONS[at - 1]!;
    const text = JSON.stringify(version.sections);
    expect(text).toContain('팀 운영');
    expect(text).toContain('보호자 메일 주소');
    expect(text).toContain(`시행일: ${SQUAD_START}`);
    const of = (item: typeof version, id: string) => item.sections.find((section) => section.id === id);
    // 위탁·국외 이전·제3자 제공·권리·보안은 그대로, 아동 절은 보호자 동의로 바뀐다
    for (const id of ['outsourcing', 'overseas', 'third-party', 'rights', 'security']) expect(JSON.stringify(of(version, id))).toBe(JSON.stringify(of(before, id)));
    expect(JSON.stringify(of(version, 'children'))).toContain('법정대리인(보호자)의 동의를 받아');
    expect(JSON.stringify(of(before, 'children'))).toContain('가입을 받지 않습니다');
    expect(version.changes.join(' ')).toContain('월간 등수 제외');
  });
});

describe('팀 코드·이름', () => {
  it('코드는 6자리, 헷갈리는 글자 없음, 소문자·공백을 고쳐 읽는다', () => {
    for (let index = 0; index < 200; index += 1) expect(isSquadCode(makeSquadCode())).toBe(true);
    for (const char of '0O1I') expect(SQUAD_CODE_CHARS).not.toContain(char);
    expect(normalizeSquadCode(' ab cd 23 ')).toBe('ABCD23');
    expect(isSquadCode('ABCDE1')).toBe(false);
  });

  it('이름: 2~12자, 실제 구단 이름·별칭과 비속어는 막고 조합은 둔다', () => {
    expect(squadNameProblem('동네 직관단')).toBeNull();
    expect(squadNameProblem('우리동네 트윈스')).toBeNull();
    expect(squadNameProblem('김')).toMatch(/2자 이상/);
    expect(squadNameProblem('가나다라마바사아자차카타파')).toMatch(/12자/);
    expect(squadNameProblem('LG 트윈스')).toMatch(/실제 구단/);
    expect(squadNameProblem('lg트윈스')).toMatch(/실제 구단/);
    expect(squadNameProblem('기아')).toBeNull();
    expect(squadNameProblem('KIA')).toMatch(/실제 구단/);
    expect(squadNameProblem('이글스')).toMatch(/실제 구단/);
    expect(squadNameProblem('삼성 라이온즈 팬')).toMatch(/실제 구단/);
    expect(squadNameProblem('ㅅㅂ팀')).toMatch(/쓸 수 없는/);
    expect(squadNameProblem('a/b')).toMatch(/'\/'/);
  });
});

describe('팀 로고', () => {
  it('틀 6·상징 12·색 12, 어느 주색이든 읽히는 보조색이 2개 이상', () => {
    expect(LOGO_FRAMES).toHaveLength(6);
    expect(LOGO_SYMBOLS).toHaveLength(12);
    expect(LOGO_COLORS).toHaveLength(12);
    for (const primary of LOGO_COLORS) {
      expect(LOGO_COLORS.filter((secondary) => colorsReadable(primary.id, secondary.id)).length, primary.id).toBeGreaterThanOrEqual(2);
    }
    expect(colorsReadable('navy', 'navy')).toBe(false);
    expect(contrastRatio(colorHex('black'), colorHex('white'))).toBeGreaterThan(15);
  });

  it('기본 로고는 문제가 없고, 비슷한 색·잘못된 글자는 안내한다', () => {
    expect(logoProblem(DEFAULT_LOGO)).toBeNull();
    expect(logoProblem({ ...DEFAULT_LOGO, secondary: 'blue' })).toMatch(/비슷/);
    expect(logoProblem({ ...DEFAULT_LOGO, initials: 'ABCD' })).toMatch(/1~3자/);
    expect(logoProblem({ ...DEFAULT_LOGO, initials: '김씨' })).toMatch(/한글 한 글자/);
    expect(logoProblem({ ...DEFAULT_LOGO, initials: '김' })).toBeNull();
  });

  it('저장값이 어긋나면 기본값으로 채운다, 이니셜 기본값', () => {
    expect(toLogo({ frame: 'heart', symbol: 'star', primary: 'red', secondary: 'white', initials: 'K' })).toEqual({
      frame: 'shield',
      symbol: 'star',
      primary: 'red',
      secondary: 'white',
      initials: 'K',
    });
    expect(toLogo(undefined)).toEqual(DEFAULT_LOGO);
    expect(defaultInitials('Home Runs')).toBe('HR');
    expect(defaultInitials('Dongne Jikgwan Club')).toBe('DJC');
    expect(defaultInitials('김씨네 야구단')).toBe('김');
  });
});

describe('팀 주간 리그(앱과 운영자 PC가 같은 계산)', () => {
  it('주는 월~일 — 화요일(12-15)이 든 주의 월요일은 12-14', () => {
    expect(weekStartOf('2026-12-15')).toBe('2026-12-14');
    expect(weekStartOf('2026-12-20')).toBe('2026-12-14');
    expect(weekStartOf('2026-12-21')).toBe('2026-12-21');
    expect(weekDays('2026-12-28')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
    for (const day of ['2026-12-15', '2027-01-01', '2027-03-07']) expect(ops.weekStartOf(day)).toBe(weekStartOf(day));
  });

  it('팀 점수 = 상위 5명 평균(인원이 많아도 유리하지 않다)', () => {
    expect(squadScore([])).toBe(0);
    expect(squadScore([300, 200])).toBe(250);
    expect(squadScore([500, 500, 500, 500, 500, 10, 10, 10, 10])).toBe(500);
    expect(squadScore([100, 200, 300, 400, 500, 600])).toBe(400);
    for (const list of [[], [300, 200], [1, 2, 3, 4, 5, 6, 7]]) expect(ops.squadScore(list)).toBe(squadScore(list));
    expect(matchSideScore([150, 100])).toBe(125);
  });

  it('순위: 점수 → 참가 인원 → 코드, 참가자가 없는 팀은 뺀다', () => {
    const ranked = ops.rankSquads([
      { code: 'BBBBBB', score: 300, players: 2 },
      { code: 'AAAAAA', score: 300, players: 2 },
      { code: 'CCCCCC', score: 300, players: 3 },
      { code: 'DDDDDD', score: 900, players: 0 },
      { code: 'EEEEEE', score: 100, players: 1 },
    ]);
    expect(ranked.map((row) => `${row.rank}${row.code[0]}`)).toEqual(['1C', '2A', '3B', '4E']);
  });

  it('주 점수는 그 주 날짜만, 보너스는 주마다 합', () => {
    const days = weekDays('2026-12-14').filter((day) => day >= '2026-12-15');
    expect(ops.weekPoints([{ '20261214': 500, '20261215': 300, '20261216': 200 }, { '20261221': 100 }], days)).toEqual({ points: 500, days: 2 });
    expect(ops.bonusOf({ '2026-12-14': 30, '2026-12-21': 10 })).toBe(40);
    expect(ops.bonusOf(undefined)).toBe(0);
  });
});

describe('팀 규칙 도우미', () => {
  it('감독이 나가면 가장 먼저 들어온 어른 팀원이 이어받는다', () => {
    const members = [
      { uid: 'cap', nickname: '감독', joinedAt: 1, child: false },
      { uid: 'kid', nickname: '막내', joinedAt: 2, child: true },
      { uid: 'mom', nickname: '엄마', joinedAt: 3, child: false },
    ];
    expect(nextCaptain(members, 'cap')).toBe('mom');
    expect(nextCaptain(members.slice(0, 2), 'cap')).toBeNull();
  });

  it('나간 뒤 7일 동안은 다른 팀에 못 들어간다', () => {
    const now = Date.UTC(2026, 11, 20);
    expect(rejoinBlockedUntil(null, now)).toBeNull();
    expect(rejoinBlockedUntil(now - 86_400_000, now)).toBe(now + 6 * 86_400_000);
    expect(rejoinBlockedUntil(now - 8 * 86_400_000, now)).toBeNull();
  });
});

describe('보호자 동의(만 14세 미만)', () => {
  it('동의 메일에 코드와 동의 내용이 들어가고, 주소가 정해지기 전에는 자녀 가입 길을 열지 않는다', () => {
    const mail = guardianMail('ABC234', null);
    expect(mail.subject).toContain('ABC234');
    expect(mail.body).toContain('법정대리인');
    expect(mail.body).toContain('가족팀');
    expect(guardianMailto('help@example.com', 'ABC234', null)).toMatch(/^mailto:help@example\.com\?subject=/);
    expect(guardianSignupOpen(kst('2026-12-20'), null)).toBe(false);
    expect(guardianSignupOpen(kst('2026-12-01'), 'help@example.com')).toBe(false);
    expect(guardianSignupOpen(kst('2026-12-20'), 'help@example.com')).toBe(true);
    expect(GUARDIAN_CODE_PATTERN.test(makeSquadCode())).toBe(true);
    expect(isGuardianEmail('mom@example.com')).toBe(true);
    expect(isGuardianEmail('mom@example')).toBe(false);
  });

  it('규칙: 동의 받은 계정도 기록을 남길 수 있고, 초대 코드는 못 만든다', () => {
    expect(rules).toContain("get(userPath(request.auth.uid)).data.get('guardianConsentAt', null) != null");
    expect(rules).toContain("&& resource.data.get('guardianConsentAt', null) == null");
  });
});
