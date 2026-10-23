-- 야구왕 P1 — 0008 스트라이크존 약점 집계
-- P1에서는 수집만 시작한다. 히트맵 화면과 약점 코스 훈련은 P2다 (06 문서 §10).
-- 가로축 = 시대(era_band 1~3), 세로축 = 난이도(difficulty_band 1~3).

create table public.user_zone_cells (
  user_id uuid not null references public.profiles(id) on delete cascade,
  era_band smallint not null check (era_band between 1 and 3),
  difficulty_band smallint not null check (difficulty_band between 1 and 3),
  attempts integer not null default 0 check (attempts >= 0),
  correct integer not null default 0 check (correct >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, era_band, difficulty_band),
  constraint zone_correct_le_attempts check (correct <= attempts)
);

create index idx_zone_user on public.user_zone_cells (user_id);
