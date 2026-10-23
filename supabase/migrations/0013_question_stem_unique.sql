-- 야구왕 P1 — 0013 문항 중복 방지
--
-- 문제:
--   임포터를 두 번 돌리면 같은 문항이 UUID만 다른 채로 두 벌 들어간다.
--   한 경기에서 같은 문항은 다시 안 나오지만(unique(session_id, question_id)),
--   **내용이 같은 다른 문항**은 막지 못해 한 이닝에 같은 질문이 두 번 나온다.
--   운영에서 같은 CSV를 재업로드하면 문제은행이 그대로 오염된다.
--
-- 해결:
--   출제 대상이 되는 문항(retired 제외)의 본문을 유일하게 만든다.
--   retired 를 제외하는 이유는, 정정으로 내린 옛 문항과 같은 본문을
--   새로 올릴 수 있어야 하기 때문이다.
--
-- 기존 중복 정리:
--   각 본문에서 가장 먼저 만들어진 한 건만 남긴다. 나머지는
--     - 출제 이력이 없으면 삭제
--     - 출제 이력이 있으면 **삭제하지 않고 retired 로 내린다**
--   at_bats 가 questions 를 참조하므로 played 문항을 지우면 FK 가 막는다.
--   무엇보다 원장은 보존되어야 한다 — 지난 경기의 타석이 가리키는 문항이
--   사라지면 결과 화면과 통산 재계산이 깨진다.

with ranked as (
  select id,
         stem,
         row_number() over (partition by stem order by created_at, id) as rn
    from public.questions
   where status <> 'retired'
),
duplicates as (
  select id from ranked where rn > 1
)
update public.questions
   set status = 'retired'
 where id in (select id from duplicates)
   and exists (select 1 from public.at_bats ab where ab.question_id = questions.id);

with ranked as (
  select id,
         stem,
         row_number() over (partition by stem order by created_at, id) as rn
    from public.questions
   where status <> 'retired'
),
duplicates as (
  select id from ranked where rn > 1
)
delete from public.questions
 where id in (select id from duplicates);

create unique index questions_stem_active_unique
  on public.questions (stem)
  where status <> 'retired';
