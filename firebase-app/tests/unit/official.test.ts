import { describe, expect, it } from 'vitest';
import * as job from '../../ops/official.mjs';
import { PRIVACY_VERSIONS, ENGAGEMENT_PRIVACY_EFFECTIVE } from '@/content/privacy';
import {
  OFFICIAL_GRACE_MS,
  OFFICIAL_POINTS,
  OFFICIAL_QUESTION_MS,
  OFFICIAL_TOTAL,
  gradeAttempt,
  officialSum,
  questionPoints,
  roundIdOf,
} from '@/lib/game/official';
import { OFFICIAL_RETENTION_DAYS } from '@/lib/privacy/retention';

/** 오늘의 공식전(docs/engagement-plan.md §5) — 화면(official.ts)과 운영자 PC 판정(ops/official.mjs)이 같은지 */
const header =
  'category_slug,difficulty,record_as_of,era_year,season_scope,stem,explanation,option_a,option_b,option_c,option_d,correct_label,source_name,source_url,verified_at,rights_note';
const row = (stem: string, correct = 'B', extra: Partial<Record<'difficulty' | 'source', string>> = {}) =>
  `rules,${extra.difficulty ?? 'easy'},2026-11-01,,,${stem},해설,가,나,다,라,${correct},${extra.source ?? '운영자 작성'},,2026-11-01,직접 씀`;

describe('점수', () => {
  it(`맞히면 ${OFFICIAL_POINTS.correct} + 빠르기 최대 ${OFFICIAL_POINTS.speedMax}, ${OFFICIAL_QUESTION_MS / 1000}초 + 여유 ${OFFICIAL_GRACE_MS / 1000}초를 넘기면 0`, () => {
    expect(questionPoints(true, 0)).toBe(150);
    expect(questionPoints(true, 7_500)).toBe(125);
    expect(questionPoints(true, 15_000)).toBe(100);
    expect(questionPoints(true, 16_500)).toBe(100); // 네트워크 여유
    expect(questionPoints(true, 16_501)).toBe(0);
    expect(questionPoints(false, 1_000)).toBe(0);
  });

  it('문제마다 걸린 시간 = 이 답 − 앞 답(서버 시각), 끝까지 풀면 완주 +20, 시간 초과(null)도 답한 것', () => {
    const key = ['A', 'B', 'C', 'D', 'A'];
    const answers = {
      '0': { choice: 'A', at: 3_000 }, // 3초, 맞힘
      '1': { choice: 'C', at: 6_000 }, // 틀림
      '2': { choice: null, at: 22_000 }, // 시간 초과
      '3': { choice: 'D', at: 40_000 }, // 18초 — 맞혀도 시간 넘김
      '4': { choice: 'A', at: 41_000 }, // 1초
    };
    const result = gradeAttempt(0, answers, key);
    expect(result.questions.map((question) => question.elapsedMs)).toEqual([3_000, 3_000, 16_000, 18_000, 1_000]);
    expect(result.correct).toBe(2);
    expect(result.points).toBe(questionPoints(true, 3_000) + questionPoints(true, 1_000) + OFFICIAL_POINTS.finish);
    const partial = gradeAttempt(0, { '0': answers['0'] }, key);
    expect(partial).toMatchObject({ answered: 1, points: questionPoints(true, 3_000) }); // 완주 보너스 없음
  });

  it('운영자 PC 판정과 같은 값 — 무작위 1,000가지', () => {
    let seed = 11;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1000; i += 1) {
      const key = Array.from({ length: OFFICIAL_TOTAL }, () => 'ABCD'[Math.floor(random() * 4)]!);
      const answers: Record<string, { choice: string | null; at: number }> = {};
      let at = 1_000;
      const count = Math.floor(random() * (OFFICIAL_TOTAL + 1));
      for (let index = 0; index < count; index += 1) {
        at += Math.floor(random() * 20_000);
        answers[String(index)] = { choice: random() < 0.1 ? null : 'ABCD'[Math.floor(random() * 4)]!, at };
      }
      expect(job.gradeAttempt(1_000, answers, key)).toEqual(gradeAttempt(1_000, answers, key));
    }
    expect(job.OFFICIAL_TOTAL).toBe(OFFICIAL_TOTAL);
    expect(job.OFFICIAL_POINTS).toEqual(OFFICIAL_POINTS);
    expect(job.OFFICIAL_RETENTION_DAYS).toBe(OFFICIAL_RETENTION_DAYS);
  });

  it('공식전 ID = 한국 날짜, 그 달 합은 그 달·그날까지만', () => {
    expect(roundIdOf(Date.UTC(2026, 10, 4, 15))).toBe('20261105'); // 11-05 00:00 KST
    expect(job.roundIdOf(Date.UTC(2026, 10, 4, 14, 59))).toBe('20261104');
    expect(job.roundOpensAt('20261105')).toBe(Date.UTC(2026, 10, 4, 15));
    const days = { '20261105': 300, '20261106': 200, '20261201': 999 };
    expect(officialSum(days, '202611')).toEqual({ points: 500, rounds: 2 });
    expect(officialSum(days, '202611', 5)).toEqual({ points: 300, rounds: 1 });
  });
});

describe('문항 풀(운영자 PC — 저장소에 올리지 않음)', () => {
  it('앱 문제은행과 같은 섞기·ID, 정답 라벨은 섞인 뒤의 것', () => {
    const { questions, problems } = job.parsePool([header, row('공식전 시험 문항 하나', 'B')].join('\n'), new Set());
    expect(problems).toEqual([]);
    const [question] = questions;
    expect(question!.id).toMatch(/^q[0-9a-f]{12}$/);
    expect(question!.options.map((option) => option.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(question!.options.find((option) => option.label === question!.correct)!.text).toBe('나');
  });

  it('빠진 칸·잘못된 정답·난이도·두 번·앱 문제은행에 있는 문항은 쓰지 않는다', () => {
    const inBank = job.parsePool([header, row('이미 공개된 문항')].join('\n')).questions[0]!.id;
    const { questions, problems } = job.parsePool(
      [header, row('정상'), row('정답 틀림', 'E'), row('난이도 틀림', 'A', { difficulty: 'super' }), row('출처 없음', 'A', { source: '' }), row('정상'), row('이미 공개된 문항')].join('\n'),
      new Set([inBank]),
    );
    expect(questions.map((question) => question.stem)).toEqual(['정상']);
    expect(problems).toHaveLength(5);
  });

  it('실제 앱 문제은행 문항은 거절된다', () => {
    const bank = job.bankIds();
    expect(bank.size).toBeGreaterThan(500);
  });
});

describe('처리방침(11-05 판)', () => {
  it(`공식전 답 보관 ${OFFICIAL_RETENTION_DAYS}일과 채점을 적었다`, () => {
    const text = JSON.stringify(PRIVACY_VERSIONS.find((version) => version.effective === ENGAGEMENT_PRIVACY_EFFECTIVE));
    expect(text).toContain(`공식전 날부터 ${OFFICIAL_RETENTION_DAYS}일`);
    expect(text).toContain('고른 보기·답한 시각');
  });
});
