/**
 * 검수 문항 일괄 투입.
 *
 * CSV → 검증 → 한 트랜잭션으로 INSERT. **검증 실패 시 전체 롤백**한다
 * (09 문서 §11). 기본은 `draft`이며, `--publish`를 주면 게시까지 시도한다.
 * 게시 조건(보기 4개 · 정답 1개 · 출처 1건)은 DB 트리거가 최종 검증한다.
 *
 * 사용:
 *   node scripts/seed-questions.mjs data/questions.sample.csv
 *   node scripts/seed-questions.mjs data/questions.sample.csv --publish
 *
 * 선택 컬럼: explanation, era_year, season_scope, source_url, rights_note.
 * `season_scope`는 문항 카드에 그대로 노출된다. 해마다 바뀌는 규정처럼
 * 답이 시즌에 묶이는 문항은 반드시 적는다 — 없으면 오래된 답이 정답처럼 보인다.
 * `rights_note`는 그 출처를 쓸 수 있는 근거를 남기는 자리다. 규정 문서처럼
 * 조항을 특정할 수 있는 출처는 여기에 근거를 적는다.
 *
 * 데이터 사용권 확보 전에는 자체 작성 문항과 검증된 공개 사실만 넣는다.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

/**
 * CSV의 보기 순서(a~d)에 붙일 라벨을 정한다.
 *
 * 작성자는 정답을 앞쪽에 두는 버릇이 있다. 실제로 이 보정을 넣기 전 문제은행은
 * 정답이 A에 53.5%, D에 0.8% 몰려 있었다 — **문항을 읽지 않고 A만 찍어도
 * 절반을 맞히는 상태였다.** 속도가 타구 결과를 정하는 게임이라 이건 치명적이다.
 *
 * 본문 해시로 섞으므로 같은 CSV를 다시 넣어도 결과가 같다. DB 재배치와
 * 재적재가 어긋나지 않아야 하기 때문에 난수를 쓰지 않는다.
 *
 * @returns {string[]} 인덱스 0~3(= option_a~d)에 붙일 라벨
 */
export function labelPermutation(stem) {
  const digest = createHash('sha256').update(stem, 'utf8').digest();
  const labels = ['A', 'B', 'C', 'D'];
  for (let i = labels.length - 1; i > 0; i -= 1) {
    const j = digest[i] % (i + 1);
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  return labels;
}

const REQUIRED_COLUMNS = [
  'category_slug',
  'difficulty',
  'record_as_of',
  'stem',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'correct_label',
  'source_name',
  'verified_at',
];

/** 따옴표와 줄바꿈을 다루는 최소 CSV 파서. */
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

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((entry) => entry.some((value) => value.trim().length > 0));
}

export function toRecords(rows) {
  const [header, ...body] = rows;
  if (!header) throw new Error('CSV가 비어 있습니다.');

  const columns = header.map((name) => name.trim());
  for (const required of REQUIRED_COLUMNS) {
    if (!columns.includes(required)) {
      throw new Error(`필수 컬럼이 없습니다: ${required}`);
    }
  }

  return body.map((values, index) => {
    const record = {};
    columns.forEach((name, position) => {
      record[name] = (values[position] ?? '').trim();
    });
    record.__line = index + 2;
    return record;
  });
}

function validate(record) {
  const problems = [];

  if (!['easy', 'normal', 'hard'].includes(record.difficulty)) {
    problems.push(`difficulty는 easy/normal/hard여야 합니다 (${record.difficulty})`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.record_as_of)) {
    problems.push('record_as_of는 YYYY-MM-DD여야 합니다');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.verified_at)) {
    problems.push('verified_at은 YYYY-MM-DD여야 합니다');
  }
  if (!['A', 'B', 'C', 'D'].includes(record.correct_label)) {
    problems.push('correct_label은 A~D여야 합니다');
  }
  if (record.stem.length < 5) {
    problems.push('stem이 너무 짧습니다');
  }
  for (const label of ['a', 'b', 'c', 'd']) {
    if (record[`option_${label}`].length === 0) {
      problems.push(`option_${label}가 비어 있습니다`);
    }
  }
  if (record.source_name.length === 0) {
    problems.push('source_name이 비어 있습니다');
  }
  if (record.era_year && !/^\d{4}$/.test(record.era_year)) {
    problems.push('era_year는 4자리 연도여야 합니다');
  }

  return problems;
}

async function main() {
  const [file, ...flags] = process.argv.slice(2);
  if (!file) {
    console.error('사용법: node scripts/seed-questions.mjs <csv> [--publish]');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL이 없습니다. .env.local을 확인하세요.');
    process.exit(1);
  }

  const publish = flags.includes('--publish');
  const records = toRecords(parseCsv(readFileSync(file, 'utf8')));

  const problems = records.flatMap((record) =>
    validate(record).map((problem) => `  ${file}:${record.__line} ${problem}`),
  );
  if (problems.length > 0) {
    console.error(`검증 실패 ${problems.length}건. 아무것도 넣지 않았습니다.`);
    console.error(problems.join('\n'));
    process.exit(1);
  }

  const sql = postgres(connectionString, { prepare: false, max: 2 });

  try {
    const outcome = await sql.begin(async (tx) => {
      const ids = [];
      const skipped = [];

      // 이미 있는 본문은 건너뛴다. 같은 CSV를 두 번 올려도 문제은행이
      // 오염되지 않아야 한다 (0013의 유니크 인덱스와 같은 기준).
      const existing = await tx`
        select stem from public.questions where status <> 'retired'
      `;
      const existingStems = new Set(existing.map((row) => row.stem));

      for (const record of records) {
        if (existingStems.has(record.stem)) {
          skipped.push(record.__line);
          continue;
        }
        existingStems.add(record.stem);
        const [category] = await tx`
          select id from public.question_categories
           where slug = ${record.category_slug}
        `;
        if (!category) {
          throw new Error(
            `${file}:${record.__line} 카테고리를 찾을 수 없습니다: ${record.category_slug}`,
          );
        }

        const [question] = await tx`
          insert into public.questions (
            category_id, stem, explanation, difficulty, status, record_as_of,
            era_year, season_scope
          )
          values (
            ${category.id}, ${record.stem}, ${record.explanation || null},
            ${record.difficulty}, 'draft', ${record.record_as_of}::date,
            ${record.era_year ? Number(record.era_year) : null},
            ${record.season_scope || null}
          )
          returning id
        `;

        // CSV 순서(a~d)를 그대로 쓰지 않고 본문 해시로 섞어 라벨을 붙인다.
        const labels = labelPermutation(record.stem);
        for (const [position, csvLabel] of ['A', 'B', 'C', 'D'].entries()) {
          await tx`
            insert into private.question_options (question_id, label, option_text, is_correct)
            values (
              ${question.id}, ${labels[position]},
              ${record[`option_${csvLabel.toLowerCase()}`]},
              ${csvLabel === record.correct_label}
            )
          `;
        }

        await tx`
          insert into public.question_sources (
            question_id, source_name, url, verified_at, rights_note
          )
          values (
            ${question.id}, ${record.source_name}, ${record.source_url || null},
            ${record.verified_at}::date, ${record.rights_note || null}
          )
        `;

        if (publish) {
          await tx`
            update public.questions set status = 'published' where id = ${question.id}
          `;
        }

        ids.push(question.id);
      }

      return { ids, skipped };
    });

    console.log(
      `${outcome.ids.length}문항 투입 완료 (${publish ? 'published' : 'draft'}).`,
    );
    if (outcome.skipped.length > 0) {
      console.log(
        `${outcome.skipped.length}문항은 이미 있어 건너뛰었습니다 ` +
          `(줄 ${outcome.skipped.join(', ')}).`,
      );
    }
    if (!publish && outcome.ids.length > 0) {
      console.log('게시하려면 운영 콘솔에서 승인하거나 --publish로 다시 실행하세요.');
    }
  } catch (error) {
    console.error('투입 실패. 전체 롤백되었습니다.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// 직접 실행할 때만 돈다. `labelPermutation`을 재배치 스크립트가 가져다 쓰는데,
// 모듈을 불러오는 것만으로 적재가 돌면 안 된다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
