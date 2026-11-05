import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HINT_PRIVACY_EFFECTIVE, PRIVACY_VERSIONS, upcomingVersions } from '@/content/privacy';
import questions from '@/content/questions.generated.json';
import type { Question } from '@/content/questions';
import { resolveAtBat } from '@/lib/engine';
import { shareText } from '@/lib/game/daily';
import {
  HINT_COST,
  HINT_START,
  capHintResult,
  chosungHint,
  fiftyFifty,
  hintVerdict,
  hintsOpen,
  initialsHint,
} from '@/lib/game/hints';
import { answerAtBat, startMatch } from '@/lib/game/match';

const bank = questions as Question[];
const question: Question = {
  id: 'q000000000001',
  category: 'korean-series',
  difficulty: 'hard',
  recordAsOf: '2025-12-31',
  stem: '시험 문항',
  options: [
    { label: 'A', text: '두산 베어스' },
    { label: 'B', text: 'LG 트윈스' },
    { label: 'C', text: 'KT 위즈' },
    { label: 'D', text: '삼성 라이온즈' },
  ],
  correct: 'A',
  source: { name: '시험', verifiedAt: '2026-11-01' },
};

/** 문제 풀이 힌트(docs/hint-plan.md) — 순수 판정·글자. 지갑은 규칙·운영 테스트가 본다 */
describe('힌트 판정', () => {
  it('반반·초성은 맞혀도 2루타까지, 고급 문항·연속 정답 승급도 없다', () => {
    expect(capHintResult('HR')).toBe('2B');
    expect(capHintResult('3B')).toBe('2B');
    expect(capHintResult('2B')).toBe('2B');
    expect(capHintResult('1B')).toBe('1B');
    expect(capHintResult('BB')).toBe('BB');
    expect(capHintResult('K')).toBe('K');
    for (const hint of ['fifty', 'chosung'] as const) {
      expect(hintVerdict(true, 1_000, 'normal', 0, hint)).toEqual({ result: '2B', upgraded: false, upgradeReason: null, streakAfter: 1 });
      // 고급 문항 5초 정답: 힌트 없으면 안타→2루타 승급, 힌트면 안타 그대로
      expect(resolveAtBat(true, 5_000, 'hard', 0).result).toBe('2B');
      expect(hintVerdict(true, 5_000, 'hard', 0, hint)).toMatchObject({ result: '1B', upgraded: false, upgradeReason: null });
      expect(hintVerdict(false, 1_000, 'normal', 3, hint)).toMatchObject({ result: 'K', streakAfter: 0 });
    }
  });

  it('시간 힌트·힌트 없음은 판정이 그대로다', () => {
    for (const hint of ['time', null, undefined] as const) {
      expect(hintVerdict(true, 1_000, 'hard', 0, hint)).toEqual(resolveAtBat(true, 1_000, 'hard', 0));
    }
  });

  it('경기 판정에 힌트가 반영되고, 힌트는 그 타석에만 표시된다', () => {
    const capped = answerAtBat(startMatch(), question, 'A', 1_000, 'fifty');
    expect(capped.atBat).toMatchObject({ result: '2B', hint: 'fifty', upgraded: false });
    const plain = answerAtBat(startMatch(), question, 'A', 1_000);
    expect(plain.atBat.result).toBe('HR');
    expect(plain.atBat).not.toHaveProperty('hint');
  });
});

describe('힌트 내용', () => {
  it('반반: 정답이 아닌 보기 둘, 문항마다 정해져 있다(문제은행 전체)', () => {
    for (const item of bank) {
      const gone = fiftyFifty(item);
      expect(gone, item.stem).toHaveLength(2);
      expect(new Set(gone).size).toBe(2);
      expect(gone).not.toContain(item.correct);
      expect(fiftyFifty(item)).toEqual(gone);
    }
  });

  it('초성: 낱말마다 초성, 숫자는 끝자리를 가린다, 한글이 아닌 글자는 그대로', () => {
    expect(initialsHint('두산 베어스')).toBe('ㄷㅅ ㅂㅇㅅ');
    expect(initialsHint('2016년')).toBe('201_년');
    expect(initialsHint('4승 1패')).toBe('4승 _패');
    expect(initialsHint('KT 위즈')).toBe('KT ㅇㅈ');
    expect(chosungHint(question)).toBe('ㄷㅅ ㅂㅇㅅ');
  });

  it('초성 힌트가 문제은행 어느 문항의 정답도 그대로 드러내지 않는다(한글·숫자가 있는 답)', () => {
    for (const item of bank) {
      const answer = item.options.find((option) => option.label === item.correct)!.text;
      if (/[가-힣0-9]/.test(answer)) expect(chosungHint(item), item.stem).not.toBe(answer);
    }
  });

  it('공유 줄: 힌트를 쓰면 숨기지 않고 적는다', () => {
    expect(shareText('2026-11-11', ['2B', 'K', '1B'], 1, 'u', 2)).toBe('⚾ 야구왕 오늘의 1이닝 11/11\n🟩🟥🟩 2안타 1아웃 · 힌트 2\nu');
    expect(shareText('2026-11-11', ['2B', 'K', '1B'], 1, 'u')).not.toContain('힌트');
  });
});

describe('시작일·값이 곳곳에서 같다', () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

  it('운영자 PC 지갑 작업·처리방침 판과 같은 날, 그 전에는 닫혀 있다', async () => {
    const ops = await import('../../../ops/monthly.mjs');
    expect(ops.HINT_START).toBe(HINT_START);
    expect(HINT_PRIVACY_EFFECTIVE).toBe(HINT_START);
    expect(hintsOpen('2026-11-11', HINT_START)).toBe(false);
    expect(hintsOpen('2026-11-12', HINT_START)).toBe(true);
    expect(PRIVACY_VERSIONS.map((version) => version.effective)).toContain(HINT_START);
    expect(upcomingVersions('2026-11-04').map((version) => version.effective)).toContain(HINT_START);
  }, 30_000);

  it('힌트 값이 보안 규칙(20·30)과 같다', () => {
    const rules = read('../../../firestore.rules');
    expect([...new Set(Object.values(HINT_COST))].sort()).toEqual([20, 30]);
    for (const cost of [20, 30]) expect(rules).toContain(`request.resource.data.spent == resource.data.spent + ${cost}`);
  });

  it('처리방침 힌트 판: 모은·쓴 포인트 합계와 탈퇴 시 삭제를 적었다', () => {
    const version = PRIVACY_VERSIONS.find((item) => item.effective === HINT_START)!;
    const all = JSON.stringify(version.sections);
    expect(all).toContain('힌트에 쓴 포인트 합계');
    expect(all).toContain('탈퇴하면 바로 삭제');
    expect(all).toContain(`시행일: ${HINT_START}`);
    expect(version.changes.length).toBeGreaterThan(0);
  });

  it('탈퇴할 때 지갑도 지운다, 지갑 만들기는 기기에 없다', () => {
    expect(read('../../../src/lib/profile/save.ts')).toContain("'wallet'");
    expect(read('../../../src/lib/game/wallet.ts')).not.toMatch(/setDoc|transaction\.set/);
  });
});
