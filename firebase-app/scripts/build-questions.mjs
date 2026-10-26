/**
 * 문제은행 CSV → 정적 JSON (src/content/questions.generated.json).
 *
 * Firebase판은 문항을 **Firestore에 두지 않는다.** 앱 묶음에 넣어 Hosting으로 보낸다 —
 * 문항을 볼 때 Firestore 읽기(무료 하루 5만)를 하나도 쓰지 않는다. 대신 정답이 기기로
 * 내려가므로 이 문항으로 하는 경기는 전부 **비공식**이다(16 문서).
 *
 * 원본은 저장소 루트의 data/*.csv 하나뿐이다(기존 앱과 같은 원본). 파싱·검증·보기 섞기는
 * 기존 scripts/seed-questions.mjs에서 복사했다 — 섞기가 같아야 정답 위치 분포가 기존
 * 문제은행과 같다(정답 A 쏠림 53.5% → 29.1%로 고친 그 섞기).
 *
 *   npm run content:build
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));
const OUT = fileURLToPath(new URL('../src/content/questions.generated.json', import.meta.url));

/** 기존 seed-questions.mjs와 같다: 본문 해시로 라벨을 섞는다. */
export function labelPermutation(stem) {
  const digest = createHash('sha256').update(stem, 'utf8').digest();
  const labels = ['A', 'B', 'C', 'D'];
  for (let i = labels.length - 1; i > 0; i -= 1) {
    const j = digest[i] % (i + 1);
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  return labels;
}

/** 문항 ID — 본문에서 결정적으로. 오답노트·경기 기록이 이 ID를 가리킨다(규칙: ^q[0-9a-f]{12}$). */
export function questionId(stem) {
  return `q${createHash('sha256').update(stem, 'utf8').digest('hex').slice(0, 12)}`;
}

/** 기존 seed-questions.mjs와 같은 최소 CSV 파서 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((value) => value.trim().length > 0));
}

function toRecords(rows, file) {
  const [header, ...body] = rows;
  const columns = header.map((name) => name.trim());
  return body.map((values, index) => {
    const record = { __where: `${file}:${index + 2}` };
    columns.forEach((name, position) => {
      record[name] = (values[position] ?? '').trim();
    });
    return record;
  });
}

function validate(record) {
  const problems = [];
  if (!['easy', 'normal', 'hard'].includes(record.difficulty)) problems.push('difficulty');
  if (!['A', 'B', 'C', 'D'].includes(record.correct_label)) problems.push('correct_label');
  if (!record.stem || record.stem.length < 5) problems.push('stem');
  for (const label of ['a', 'b', 'c', 'd']) if (!record[`option_${label}`]) problems.push(`option_${label}`);
  if (!record.source_name) problems.push('source_name');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.record_as_of ?? '')) problems.push('record_as_of');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.verified_at ?? '')) problems.push('verified_at');
  return problems;
}

function build() {
  const files = readdirSync(DATA_DIR).filter((name) => /^questions\..+\.csv$/.test(name)).sort();
  const seen = new Set();
  const questions = [];
  const problems = [];

  for (const file of files) {
    for (const record of toRecords(parseCsv(readFileSync(DATA_DIR + file, 'utf8')), file)) {
      const issues = validate(record);
      if (issues.length > 0) {
        problems.push(`${record.__where}: ${issues.join(', ')}`);
        continue;
      }
      if (seen.has(record.stem)) continue; // 같은 본문은 한 번만(기존 DB의 유니크 기준)
      seen.add(record.stem);

      const labels = labelPermutation(record.stem);
      const options = ['A', 'B', 'C', 'D']
        .map((csvLabel, position) => ({
          label: labels[position],
          text: record[`option_${csvLabel.toLowerCase()}`],
          correct: csvLabel === record.correct_label,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      questions.push({
        id: questionId(record.stem),
        category: record.category_slug,
        difficulty: record.difficulty,
        recordAsOf: record.record_as_of,
        ...(record.season_scope ? { seasonScope: record.season_scope } : {}),
        stem: record.stem,
        options: options.map(({ label, text }) => ({ label, text })),
        correct: options.find((option) => option.correct).label,
        ...(record.explanation ? { explanation: record.explanation } : {}),
        source: {
          name: record.source_name,
          ...(record.source_url ? { url: record.source_url } : {}),
          verifiedAt: record.verified_at,
        },
      });
    }
  }

  if (problems.length > 0) {
    console.error(`검증 실패 ${problems.length}건. 파일을 쓰지 않았습니다.\n${problems.join('\n')}`);
    process.exit(1);
  }

  questions.sort((a, b) => a.id.localeCompare(b.id));
  writeFileSync(OUT, `${JSON.stringify(questions)}\n`);
  console.log(`${questions.length}문항 → src/content/questions.generated.json (${files.length}개 CSV)`);
}

build();
