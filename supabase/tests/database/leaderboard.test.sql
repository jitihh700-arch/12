-- Tests SQL Phase 4A: leaderboard et rang individuel.

begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

select ok(has_function_privilege('authenticated', 'public.get_leaderboard(integer)', 'execute'), 'authenticated execute get_leaderboard');
select ok(has_function_privilege('authenticated', 'public.get_my_leaderboard_rank()', 'execute'), 'authenticated execute get_my_leaderboard_rank');
select ok(not has_function_privilege('anon', 'public.get_leaderboard(integer)', 'execute'), 'anon sans get_leaderboard');
select ok(to_regclass('public.leaderboard') is null, 'aucune table leaderboard dupliquee');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select
  ('20000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'leader-' || g::text || '@example.test',
  'x',
  now(),
  now(),
  now()
from generate_series(1, 25) as g;

insert into public.profiles (
  id,
  pseudo,
  pseudo_normalized,
  total_points,
  quizzes_completed,
  pseudo_changed_at,
  last_played_at,
  created_at,
  updated_at
)
select
  ('20000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
  'RankUser' || lpad(g::text, 2, '0'),
  lower('RankUser' || lpad(g::text, 2, '0')),
  case
    when g = 1 then 100
    when g = 2 then 100
    when g = 3 then 100
    else 100 - g
  end,
  g,
  now(),
  case
    when g = 1 then now() - interval '3 hours'
    when g = 2 then now() - interval '1 hour'
    when g = 3 then now() - interval '2 hours'
    when g = 25 then null
    else now() - (g || ' minutes')::interval
  end,
  now() - (g || ' days')::interval,
  now() - (g || ' days')::interval
from generate_series(1, 25) as g;

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.get_leaderboard(20) $$, '28000', 'authentication_required', 'leaderboard refuse sans auth');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000010', true);
select throws_ok($$ select public.get_leaderboard(0) $$, '22023', 'invalid_leaderboard_limit', 'limite zero refusee');
select throws_ok($$ select public.get_leaderboard(21) $$, '22023', 'invalid_leaderboard_limit', 'limite superieure refusee');
select is((select count(*)::int from public.get_leaderboard(20)), 20, 'top 20 limite');
select is((select count(*)::int from public.get_leaderboard(5)), 5, 'limite personnalisee appliquee');
select is((select pseudo from public.get_leaderboard(3) where rank = 1), 'RankUser02', 'egalite departagee par last_played_at desc');
select is((select pseudo from public.get_leaderboard(3) where rank = 2), 'RankUser03', 'deuxieme rang coherent');
select is((select pseudo from public.get_leaderboard(3) where rank = 3), 'RankUser01', 'troisieme rang stable');
select is((select total_points from public.get_leaderboard(1) where rank = 1), 100, 'points retournes');
select is((select quizzes_completed from public.get_leaderboard(1) where rank = 1), 2, 'nombre de quiz retournes');
select ok(not (select row_to_json(lb)::jsonb ? 'id' from public.get_leaderboard(1) as lb limit 1), 'leaderboard ne retourne pas id');
select ok(not (select row_to_json(lb)::jsonb ? 'pseudo_normalized' from public.get_leaderboard(1) as lb limit 1), 'leaderboard ne retourne pas pseudo_normalized');

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select is((select rank from public.get_my_leaderboard_rank()), 1, 'rang individuel premier');
select is((select pseudo from public.get_my_leaderboard_rank()), 'RankUser02', 'rang individuel pseudo courant');
select is((select total_players from public.get_my_leaderboard_rank()), 25, 'total_players exact');

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000025', true);
select is((select total_players from public.get_my_leaderboard_rank()), 25, 'profil sans last_played_at compte dans total');
select ok((select rank from public.get_my_leaderboard_rank()) > 20, 'rang individuel peut etre hors top 20');

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000011', true);
select is((select pseudo from public.get_my_leaderboard_rank()), 'RankUser11', 'rang individuel utilise auth.uid');

reset role;
insert into public.user_category_stats (user_id, category_id, total_points, correct_answers, quizzes_completed, last_played_at)
values
  ('20000000-0000-4000-8000-000000000002', 'series', 40, 4, 1, now()),
  ('20000000-0000-4000-8000-000000000002', 'films', 60, 6, 1, now());

select is((select sum(total_points)::int from public.user_category_stats where user_id = '20000000-0000-4000-8000-000000000002'), 100, 'stats categorie agregees sans table leaderboard');
select throws_ok($$ insert into public.user_category_stats (user_id, category_id, total_points) values ('20000000-0000-4000-8000-000000000002', 'series', 1) $$, '23505', null, 'PK protege une seconde ligne categorie');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select throws_ok($$ update public.profiles set total_points = 9999 where id = '20000000-0000-4000-8000-000000000002' $$, '42501', null, 'modification directe points refusee');
select throws_ok($$ insert into public.user_category_stats (user_id, category_id, total_points) values ('20000000-0000-4000-8000-000000000002', 'series', 10) $$, '42501', null, 'insert direct stats refuse');
select throws_ok($$ update public.user_category_stats set total_points = 999 where user_id = '20000000-0000-4000-8000-000000000002' $$, '42501', null, 'update direct stats refuse');
select throws_ok($$ select * from private.quiz_answers limit 1 $$, '42501', null, 'reponses privees invisibles');
select ok(pg_get_functiondef('public.get_leaderboard(integer)'::regprocedure) !~* 'execute[[:space:]]+', 'get_leaderboard sans SQL dynamique');
select ok(pg_get_functiondef('public.get_my_leaderboard_rank()'::regprocedure) !~* 'execute[[:space:]]+', 'get_my_leaderboard_rank sans SQL dynamique');

select * from finish();

rollback;
