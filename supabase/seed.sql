-- 야구왕 — 로컬 개발 기준 데이터
--
-- 구단은 **텍스트 명칭만** 넣는다. 로고·엠블럼·유니폼·공식 컬러는 저장하지 않는다.
-- active_from / active_to(구단 연혁)는 출처와 검증일을 확보한 뒤 채운다.
-- 미검증 연도를 추측해서 넣지 않는다.

insert into public.teams (slug, canonical_name, short_name) values
  ('doosan',  '두산 베어스',   '두산'),
  ('lg',      'LG 트윈스',     'LG'),
  ('kiwoom',  '키움 히어로즈', '키움'),
  ('ssg',     'SSG 랜더스',    'SSG'),
  ('kt',      'KT 위즈',       'KT'),
  ('nc',      'NC 다이노스',   'NC'),
  ('samsung', '삼성 라이온즈', '삼성'),
  ('lotte',   '롯데 자이언츠', '롯데'),
  ('kia',     'KIA 타이거즈',  'KIA'),
  ('hanwha',  '한화 이글스',   '한화')
on conflict (slug) do nothing;

insert into public.question_categories (slug, title, sort_order) values
  ('history',      'KBO 역사',      1),
  ('player-stats', '선수 기록',     2),
  ('team-history', '구단 역사',     3),
  ('korean-series','한국시리즈',    4),
  ('rules',        '야구 규칙·상식', 5)
on conflict (slug) do nothing;

insert into public.seasons (name, starts_at, ends_at, status) values
  ('로컬 개발 시즌', now() - interval '1 day', now() + interval '365 days', 'active')
on conflict do nothing;
