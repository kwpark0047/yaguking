/**
 * 오늘의 공식전(docs/engagement-plan.md §5) — 운영자 PC 매일 작업(ops/run-cleanup.cmd → admin-cli official).
 *
 * 1) 판정: 닫힌 공식전(어제)의 시도를 정답(officialKeys — 기기는 못 읽음)과 맞춰 점수를 매기고, 회원마다
 *    users/{uid}/officialMonth/{YYYYMM}의 `days.{YYYYMMDD}`에 쓴다(다시 돌려도 같은 값 — 두 번 더하지 않는다).
 *    끝나면 공식전 문서에 정답·해설을 공개한다(revealed). 탈퇴한 회원의 시도는 지운다
 * 2) 출제: 오늘·내일 공식전이 없으면 문항 풀(운영자 PC의 CSV — **저장소에 올리지 않는다**)에서 안 쓴 문항 5개로 만든다.
 *    앱 문제은행(공개 묶음)에 있는 문항은 쓰지 않는다
 * 3) 보관: 공식전 날부터 40일이 지난 공식전(문제·시도)과 정답 문서를 지운다
 *
 * 점수 계산은 src/lib/game/official.ts와 같아야 한다(tests/unit/official.test.ts가 대조).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { labelPermutation, parseCsv, questionId } from '../scripts/build-questions.mjs';
import { ENGAGEMENT_START } from './monthly.mjs';

export const OFFICIAL_TOTAL = 5;
export const OFFICIAL_QUESTION_MS = 15_000;
export const OFFICIAL_GRACE_MS = 1_500;
export const OFFICIAL_POINTS = { correct: 100, speedMax: 50, finish: 20 };
export const OFFICIAL_RETENTION_DAYS = 40;

const KST = 9 * 3_600_000;
const DAY = 86_400_000;

export function roundIdOf(ms) {
  return new Date(ms + KST).toISOString().slice(0, 10).replaceAll('-', '');
}

/** 그 한국 날짜 0시(ms) */
export function roundOpensAt(roundId) {
  return Date.UTC(Number(roundId.slice(0, 4)), Number(roundId.slice(4, 6)) - 1, Number(roundId.slice(6, 8))) - KST;
}

export function questionPoints(correct, elapsedMs) {
  if (!correct || elapsedMs > OFFICIAL_QUESTION_MS + OFFICIAL_GRACE_MS) return 0;
  const left = OFFICIAL_QUESTION_MS - Math.min(Math.max(elapsedMs, 0), OFFICIAL_QUESTION_MS);
  return OFFICIAL_POINTS.correct + Math.floor((OFFICIAL_POINTS.speedMax * left) / OFFICIAL_QUESTION_MS);
}

/** official.ts gradeAttempt와 같다 */
export function gradeAttempt(startedAt, answers, key) {
  const questions = [];
  let previous = startedAt;
  for (let index = 0; index < key.length; index += 1) {
    const answer = answers[String(index)];
    if (!answer) break;
    const elapsedMs = answer.at - previous;
    previous = answer.at;
    const correct = answer.choice !== null && answer.choice === key[index] && elapsedMs <= OFFICIAL_QUESTION_MS + OFFICIAL_GRACE_MS;
    questions.push({ choice: answer.choice, correct, elapsedMs, points: questionPoints(correct, elapsedMs) });
  }
  const finished = questions.length === key.length;
  return {
    questions,
    correct: questions.filter((question) => question.correct).length,
    answered: questions.length,
    points: questions.reduce((sum, question) => sum + question.points, 0) + (finished ? OFFICIAL_POINTS.finish : 0),
  };
}

const REQUIRED = ['category_slug', 'difficulty', 'stem', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_label', 'source_name', 'verified_at'];

/**
 * 문항 풀 CSV(앱 문제은행과 같은 열) → 공식전 문항. 보기 섞기·ID는 앱 문제은행과 같은 방식.
 * 빠진 칸·잘못된 정답·앱 문제은행과 겹치는 문항은 problems로 돌려준다(쓰지 않음).
 */
export function parsePool(text, bankIds = new Set()) {
  const [header, ...rows] = parseCsv(text.replace(/^﻿/, ''));
  const questions = [];
  const problems = [];
  const seen = new Set();
  rows.forEach((row, index) => {
    if (row.every((cell) => cell.trim() === '')) return;
    const record = Object.fromEntries(header.map((name, column) => [name.trim(), (row[column] ?? '').trim()]));
    const line = index + 2;
    const missing = REQUIRED.filter((name) => !record[name]);
    if (missing.length > 0) return problems.push(`${line}행: ${missing.join(', ')} 없음`);
    if (!['A', 'B', 'C', 'D'].includes(record.correct_label)) return problems.push(`${line}행: 정답은 A~D`);
    if (!['easy', 'normal', 'hard'].includes(record.difficulty)) return problems.push(`${line}행: 난이도는 easy·normal·hard`);
    const id = questionId(record.stem);
    if (bankIds.has(id)) return problems.push(`${line}행: 앱 문제은행에 이미 있는 문항(공개된 정답) — 공식전에 쓸 수 없음`);
    if (seen.has(id)) return problems.push(`${line}행: 같은 문항이 풀에 두 번`);
    seen.add(id);
    const labels = labelPermutation(record.stem);
    const options = ['A', 'B', 'C', 'D']
      .map((csvLabel, position) => ({ label: labels[position], text: record[`option_${csvLabel.toLowerCase()}`], correct: csvLabel === record.correct_label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    questions.push({
      id,
      category: record.category_slug,
      difficulty: record.difficulty,
      recordAsOf: record.record_as_of || record.verified_at,
      seasonScope: record.season_scope ?? '',
      stem: record.stem,
      options: options.map(({ label, text }) => ({ label, text })),
      correct: options.find((option) => option.correct).label,
      explanation: record.explanation ?? '',
      source: record.source_url ? `${record.source_name} ${record.source_url}` : record.source_name,
    });
  });
  return { questions, problems };
}

/** 앱 문제은행(공개 묶음)의 문항 ID — 공식전에 쓰면 정답이 이미 공개된 셈 */
export function bankIds() {
  const file = fileURLToPath(new URL('../src/content/questions.generated.json', import.meta.url));
  return new Set(JSON.parse(readFileSync(file, 'utf8')).map((question) => question.id));
}

const millis = (value) => (value instanceof Timestamp ? value.toMillis() : Number(value ?? 0));

/** 닫힌 공식전 판정 — 다시 돌려도 같은 결과 */
async function gradeRound(db, round, now) {
  const roundId = round.id;
  const keyDoc = await db.doc(`officialKeys/${roundId}`).get();
  const key = keyDoc.get('answers') ?? [];
  const attempts = await round.ref.collection('attempts').get();
  const users = attempts.size > 0 ? await db.getAll(...attempts.docs.map((attempt) => db.doc(`users/${attempt.id}`))) : [];
  const alive = new Set(users.filter((user) => user.exists).map((user) => user.id));
  const month = roundId.slice(0, 6);
  let graded = 0;
  let removed = 0;
  for (let start = 0; start < attempts.size; start += 400) {
    const batch = db.batch();
    for (const attempt of attempts.docs.slice(start, start + 400)) {
      if (!alive.has(attempt.id)) {
        batch.delete(attempt.ref); // 탈퇴한 회원의 답
        removed += 1;
        continue;
      }
      const raw = attempt.get('answers') ?? {};
      const answers = Object.fromEntries(Object.entries(raw).map(([index, answer]) => [index, { choice: answer?.choice ?? null, at: millis(answer?.at) }]));
      const result = gradeAttempt(millis(attempt.get('startedAt')), answers, key);
      batch.set(db.doc(`users/${attempt.id}/officialMonth/${month}`), { days: { [roundId]: result.points }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      graded += 1;
    }
    await batch.commit();
  }
  await round.ref.update({
    gradedAt: Timestamp.fromMillis(now),
    revealed: { answers: key, explanations: keyDoc.get('explanations') ?? [], sources: keyDoc.get('sources') ?? [] },
    participants: graded,
  });
  return { graded, removed };
}

/** 오늘·내일 공식전 만들기(없을 때만). 풀이 모자라면 그날은 만들지 않는다 */
async function publish(db, pool, now, start) {
  const usedRef = db.doc('officialPool/used');
  const used = new Set((await usedRef.get()).get('ids') ?? []);
  const fresh = pool.filter((question) => !used.has(question.id));
  const startDay = start.replaceAll('-', '');
  const published = [];
  const short = [];
  for (const roundId of [roundIdOf(now), roundIdOf(now + DAY)]) {
    if (roundId < startDay) continue;
    const ref = db.doc(`officialRounds/${roundId}`);
    if ((await ref.get()).exists) continue;
    if (fresh.length < OFFICIAL_TOTAL) {
      short.push(roundId);
      continue;
    }
    const picked = fresh.splice(0, OFFICIAL_TOTAL);
    const opensAt = roundOpensAt(roundId);
    const batch = db.batch();
    batch.set(ref, {
      opensAt: Timestamp.fromMillis(opensAt),
      closesAt: Timestamp.fromMillis(opensAt + DAY),
      total: OFFICIAL_TOTAL,
      createdAt: FieldValue.serverTimestamp(),
    });
    picked.forEach((question, index) => {
      batch.set(ref.collection('questions').doc(String(index)), {
        stem: question.stem,
        options: question.options,
        category: question.category,
        difficulty: question.difficulty,
        recordAsOf: question.recordAsOf,
        seasonScope: question.seasonScope,
      });
    });
    batch.set(db.doc(`officialKeys/${roundId}`), {
      answers: picked.map((question) => question.correct),
      questionIds: picked.map((question) => question.id),
      explanations: picked.map((question) => question.explanation),
      sources: picked.map((question) => question.source),
    });
    batch.set(usedRef, { ids: FieldValue.arrayUnion(...picked.map((question) => question.id)) }, { merge: true });
    await batch.commit();
    published.push(roundId);
  }
  return { published, short, remaining: fresh.length };
}

/**
 * 매일 실행: 판정 → 출제 → 오래된 공식전 지우기. 풀 문자열이 없으면 판정·지우기만.
 * `start`·`now`·`bank`는 테스트용.
 */
export async function runOfficial({ db, poolText = null, now = Date.now(), start = ENGAGEMENT_START, bank = bankIds() }) {
  const report = { graded: [], attempts: 0, removedAttempts: 0, published: [], short: [], remaining: null, problems: [], deletedRounds: 0 };
  const rounds = await db.collection('officialRounds').get();
  for (const round of rounds.docs) {
    if (millis(round.get('closesAt')) > now || round.get('gradedAt')) continue;
    const result = await gradeRound(db, round, now);
    report.graded.push(round.id);
    report.attempts += result.graded;
    report.removedAttempts += result.removed;
  }

  if (poolText !== null) {
    const { questions, problems } = parsePool(poolText, bank);
    report.problems = problems;
    Object.assign(report, await publish(db, questions, now, start));
  }

  const cutoff = now - OFFICIAL_RETENTION_DAYS * DAY;
  for (const round of rounds.docs) {
    if (roundOpensAt(round.id) >= cutoff) continue;
    await db.recursiveDelete(round.ref);
    await db.doc(`officialKeys/${round.id}`).delete();
    report.deletedRounds += 1;
  }

  // 관리자 화면용 — 남은 문항(며칠 치)
  if (report.remaining !== null) {
    await db.doc('adminStats/official').set({
      remaining: report.remaining,
      daysLeft: Math.floor(report.remaining / OFFICIAL_TOTAL),
      short: report.short,
      problems: report.problems.length,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  return report;
}
