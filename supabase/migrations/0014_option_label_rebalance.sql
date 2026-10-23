-- 보기 라벨 유니크 제약을 지연 가능하게 바꾼다.
--
-- 왜 필요한가: 정답이 A에 몰려 있으면 문항을 읽지 않고 A만 찍어도 맞는다.
-- 2026-10-24 측정값은 A 53.5% / B 31.1% / C 14.7% / D 0.8%였다. 속도가 타구
-- 결과를 정하는 게임이라, 읽지 않고 찍는 쪽이 유리해지면 기믹 자체가 깨진다.
--
-- 라벨을 섞으려면 한 문항의 네 행을 동시에 바꿔야 한다. 즉시 검사하는 유니크
-- 제약에서는 교환(A↔B)이 중간 상태에서 충돌하므로 한 트랜잭션 안에서 검사를
-- 미룰 수 있어야 한다.
--
-- INITIALLY IMMEDIATE 이므로 평소 동작(INSERT 즉시 검사)은 그대로다.
-- 재배치 작업만 SET CONSTRAINTS ... DEFERRED 로 미룬다.

alter table private.question_options
  drop constraint question_options_question_id_label_key;

alter table private.question_options
  add constraint question_options_question_id_label_key
  unique (question_id, label) deferrable initially immediate;
