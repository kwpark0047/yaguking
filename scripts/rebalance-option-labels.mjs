/**
 * 보기 라벨 재배치.
 *
 * 작성자가 정답을 앞쪽에 두는 버릇 때문에 문제은행의 정답 위치가 한쪽으로
 * 쏠린다. 쏠리면 **문항을 읽지 않고 한 글자만 찍어도 맞는다.** 속도가 타구
 * 결과를 정하는 게임이라 이 구멍은 기믹 자체를 무력화한다.
 *
 * `seed-questions.mjs`의 `labelPermutation`과 **같은 함수**로 라벨을 다시
 * 매긴다. CSV가 원본이므로, 이 스크립트를 돌린 결과와 CSV를 새로 적재한
 * 결과가 같아야 한다. 그래야 `db reset` 후에도 같은 상태가 재현된다.
 *
 * 보기 행의 id는 바꾸지 않는다. `at_bats.option_id`가 지난 경기 기록으로
 * 그 id를 들고 있기 때문이다. 라벨만 바꾼다.
 *
 * 사용:
 *   node scripts/rebalance-option-labels.mjs data/*.csv
 *   node scripts/rebalance-option-labels.mjs --check data/*.csv   # 쓰지 않고 보고만
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { labelPermutation, parseCsv, toRecords } from './seed-questions.mjs';

const LABELS = ['A', 'B', 'C', 'D'];

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length === 0) {
    console.error('사용법: node scripts/rebalance-option-labels.mjs [--check] <csv...>');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL이 없습니다. .env.local을 확인하세요.');
    process.exit(1);
  }

  const records = files.flatMap((file) =>
    toRecords(parseCsv(readFileSync(file, 'utf8'))).map((r) => ({ ...r, __file: file })),
  );
  console.log(`CSV ${files.length}개에서 ${records.length}문항을 읽었다.`);

  const sql = postgres(connectionString, { prepare: false, max: 2 });

  try {
    const outcome = await sql.begin(async (tx) => {
      // 네 행의 라벨을 동시에 바꾸므로 교환(A↔B)이 중간 상태에서 충돌한다.
      await tx`set constraints private.question_options_question_id_label_key deferred`;

      let moved = 0;
      let unchanged = 0;
      const missing = [];

      for (const record of records) {
        const [question] = await tx`
          select id from public.questions
           where stem = ${record.stem} and status <> 'retired'
        `;
        if (!question) {
          missing.push(record.stem);
          continue;
        }

        const options = await tx`
          select id, label, option_text from private.question_options
           where question_id = ${question.id}
        `;
        if (options.length !== 4) {
          throw new Error(`보기가 4개가 아니다(${options.length}): ${record.stem}`);
        }

        const labels = labelPermutation(record.stem);
        for (const [position, csvLabel] of LABELS.entries()) {
          const text = record[`option_${csvLabel.toLowerCase()}`];
          const row = options.find((o) => o.option_text === text);
          if (!row) throw new Error(`CSV 보기를 DB에서 찾지 못했다: ${record.stem} / ${text}`);

          if (row.label === labels[position]) {
            unchanged += 1;
            continue;
          }
          await tx`
            update private.question_options
               set label = ${labels[position]}
             where id = ${row.id}
          `;
          moved += 1;
        }
      }

      if (checkOnly) throw Object.assign(new Error('__check__'), { moved, unchanged, missing });
      return { moved, unchanged, missing };
    });

    report(outcome, false);
  } catch (error) {
    if (error.message === '__check__') {
      report(error, true);
    } else {
      console.error('재배치 실패. 아무것도 바꾸지 않았다.');
      console.error(error.message);
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

function report({ moved, unchanged, missing }, dryRun) {
  console.log(`${dryRun ? '[검사만]' : '[적용]'} 라벨 변경 ${moved}건 / 그대로 ${unchanged}건`);
  if (missing.length) {
    console.log(`DB에 없는 문항 ${missing.length}건 (건너뜀):`);
    for (const stem of missing.slice(0, 5)) console.log('  -', stem);
    if (missing.length > 5) console.log(`  ... 외 ${missing.length - 5}건`);
  }
}

await main();
