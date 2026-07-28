-- Tests SQL Phase 5.1: parties multijoueur et score serveur.

begin;

create extension if not exists pgtap with schema extensions;

select plan(70);

create temp table test_multiplayer_codes (
  name text primary key,
  code text not null
) on commit drop;

grant all on test_multiplayer_codes to authenticated;

select ok(to_regclass('public.multiplayer_games') is not null, 'table multiplayer_games existe');
select ok(to_regclass('public.multiplayer_players') is not null, 'table multiplayer_players existe');
select ok(to_regclass('public.multiplayer_answers') is not null, 'table multiplayer_answers existe');
select ok(to_regclass('public.multiplayer_reactions') is not null, 'table multiplayer_reactions existe');

select ok((select relrowsecurity from pg_class where oid = 'public.multiplayer_games'::regclass), 'RLS activee games');
select ok((select relrowsecurity from pg_class where oid = 'public.multiplayer_players'::regclass), 'RLS activee players');
select ok((select relrowsecurity from pg_class where oid = 'public.multiplayer_answers'::regclass), 'RLS activee answers');
select ok((select relrowsecurity from pg_class where oid = 'public.multiplayer_reactions'::regclass), 'RLS activee reactions');

select ok(exists (select 1 from pg_constraint where conname = 'multiplayer_games_code_format_check'), 'contrainte format code');
select ok(exists (select 1 from pg_constraint where conname = 'multiplayer_games_max_players_check'), 'contrainte 2 a 4 joueurs');
select ok(exists (select 1 from pg_constraint where conname = 'multiplayer_players_score_consistent_check'), 'contrainte score = correct * 10');
select ok(exists (select 1 from pg_constraint where conname = 'multiplayer_answers_unique_answer'), 'contrainte reponse unique par joueur');

select ok(not has_table_privilege('authenticated', 'public.multiplayer_games', 'insert'), 'authenticated sans insert direct games');
select ok(not has_table_privilege('authenticated', 'public.multiplayer_players', 'update'), 'authenticated sans update direct players');
select ok(not has_table_privilege('authenticated', 'public.multiplayer_answers', 'select'), 'authenticated sans select direct answers');
select ok(not has_table_privilege('authenticated', 'public.multiplayer_reactions', 'insert'), 'authenticated sans insert direct reactions');

select ok(has_function_privilege('authenticated', 'public.create_multiplayer_game(text,integer)', 'execute'), 'execute create_multiplayer_game');
select ok(has_function_privilege('authenticated', 'public.join_multiplayer_game(text)', 'execute'), 'execute join_multiplayer_game');
select ok(has_function_privilege('authenticated', 'public.start_multiplayer_game(text)', 'execute'), 'execute start_multiplayer_game');
select ok(has_function_privilege('authenticated', 'public.submit_multiplayer_answer(text,text,uuid)', 'execute'), 'execute submit_multiplayer_answer');
select ok(not has_function_privilege('authenticated', 'private.generate_multiplayer_game_code()', 'execute'), 'generate code non expose');
select ok(not has_function_privilege('authenticated', 'private.match_multiplayer_answer(text,uuid,uuid,text)', 'execute'), 'matching prive non expose');
select ok(not has_function_privilege('anon', 'public.create_multiplayer_game(text,integer)', 'execute'), 'anon sans create');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('50000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p5-a@example.test', 'x', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p5-b@example.test', 'x', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p5-c@example.test', 'x', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p5-d@example.test', 'x', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p5-e@example.test', 'x', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p5-noprofile@example.test', 'x', now(), now(), now());

insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at, created_at, updated_at)
values
  ('50000000-0000-4000-8000-000000000001', 'MultiA', 'multia', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000002', 'MultiB', 'multib', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000003', 'MultiC', 'multic', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000004', 'MultiD', 'multid', now(), now(), now()),
  ('50000000-0000-4000-8000-000000000005', 'MultiE', 'multie', now(), now(), now());

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.create_multiplayer_game('series', 4) $$, '28000', 'authentication_required', 'create refuse sans auth');

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000006', true);
select throws_ok($$ select public.create_multiplayer_game('series', 4) $$, 'P0002', 'profile_required', 'create refuse sans profil');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.create_multiplayer_game('absente', 4) $$, 'P0002', 'category_not_found', 'categorie invalide refusee');
select throws_ok($$ select public.create_multiplayer_game('series', 5) $$, '22023', 'invalid_max_players', 'max joueurs invalide refuse');
select lives_ok($$ insert into test_multiplayer_codes (name, code) select 'main', game_code from public.create_multiplayer_game('series', 4) $$, 'cree partie');
select ok((select code from test_multiplayer_codes where name = 'main') ~ '^[A-HJ-NP-Z2-9]{6}$', 'code 6 caracteres non ambigus');
reset role;
select is((select count(*)::int from public.multiplayer_games), 1, 'une partie creee');
select is((select current_players from public.multiplayer_games where game_code = (select code from test_multiplayer_codes where name = 'main')), 1, 'hote compte comme joueur');
select is((select is_ready from public.multiplayer_players where user_id = '50000000-0000-4000-8000-000000000001'), true, 'hote pret par defaut');
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.create_multiplayer_game('series', 4) $$, 'P0001', 'active_game_exists', 'une seule partie active par joueur');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
select is((select result from public.join_multiplayer_game((select code from test_multiplayer_codes where name = 'main'))), 'joined', 'joueur B rejoint');
select is((select result from public.join_multiplayer_game((select code from test_multiplayer_codes where name = 'main'))), 'already_joined', 'doublon joueur non ajoute');
reset role;
select is((select current_players from public.multiplayer_games where game_code = (select code from test_multiplayer_codes where name = 'main')), 2, 'compteur stable apres doublon');
set local role authenticated;

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000003', true);
select is((select result from public.join_multiplayer_game((select code from test_multiplayer_codes where name = 'main'))), 'joined', 'joueur C rejoint');
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000004', true);
select is((select result from public.join_multiplayer_game((select code from test_multiplayer_codes where name = 'main'))), 'joined', 'joueur D rejoint');
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000005', true);
select throws_ok($$ select public.join_multiplayer_game((select code from test_multiplayer_codes where name = 'main')) $$, 'P0001', 'game_full', 'cinquieme joueur refuse');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.start_multiplayer_game((select code from test_multiplayer_codes where name = 'main')) $$, '42501', 'host_required', 'non hote ne demarre pas');
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.start_multiplayer_game((select code from test_multiplayer_codes where name = 'main')) $$, 'P0001', 'players_not_ready', 'joueurs non prets refusent start');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
select is((select result from public.set_multiplayer_ready((select code from test_multiplayer_codes where name = 'main'), true)), 'ready_updated', 'B pret');
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000003', true);
select is((select result from public.set_multiplayer_ready((select code from test_multiplayer_codes where name = 'main'), true)), 'ready_updated', 'C pret');
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000004', true);
select is((select result from public.set_multiplayer_ready((select code from test_multiplayer_codes where name = 'main'), true)), 'ready_updated', 'D pret');
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select is((select result from public.start_multiplayer_game((select code from test_multiplayer_codes where name = 'main'))), 'started', 'hote demarre');
reset role;
select is((select status from public.multiplayer_games where game_code = (select code from test_multiplayer_codes where name = 'main')), 'playing', 'statut playing');
select ok((select expires_at > started_at from public.multiplayer_games where game_code = (select code from test_multiplayer_codes where name = 'main')), 'expires_at serveur apres start');
set local role authenticated;

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
select is((select result from public.submit_multiplayer_answer((select code from test_multiplayer_codes where name = 'main'), 'Walter White', '60000000-0000-4000-8000-000000000001')), 'correct', 'reponse correcte');
select is((select result from public.submit_multiplayer_answer((select code from test_multiplayer_codes where name = 'main'), 'Walter White', '60000000-0000-4000-8000-000000000002')), 'duplicate', 'doublon sans credit');
select is((select result from public.submit_multiplayer_answer((select code from test_multiplayer_codes where name = 'main'), 'Inconnu', '60000000-0000-4000-8000-000000000003')), 'incorrect', 'mauvaise reponse');
reset role;
select is((select score from public.multiplayer_players where user_id = '50000000-0000-4000-8000-000000000002'), 10, 'score serveur 10');
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
select ok(not (select row_to_json(s)::jsonb ? 'answer_id' from public.submit_multiplayer_answer((select code from test_multiplayer_codes where name = 'main'), 'Rien', null) as s limit 1), 'submit ne revele pas answer_id');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000005', true);
select throws_ok($$ select public.submit_multiplayer_answer((select code from test_multiplayer_codes where name = 'main'), 'Rick Grimes', null) $$, '42501', 'not_a_player', 'non membre refuse');

select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select is((select result from public.finish_multiplayer_game((select code from test_multiplayer_codes where name = 'main'))), 'finished', 'finalisation partie');
reset role;
select is((select status from public.multiplayer_games where game_code = (select code from test_multiplayer_codes where name = 'main')), 'finished', 'statut finished');
select is((select total_points from public.profiles where id = '50000000-0000-4000-8000-000000000002'), 10, 'profil joueur B credite');
select is((select quizzes_completed from public.profiles where id = '50000000-0000-4000-8000-000000000002'), 1, 'quiz complete joueur B');
select is((select total_points from public.user_category_stats where user_id = '50000000-0000-4000-8000-000000000002' and category_id = 'series'), 10, 'stats categorie multijoueur');
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select is((select result from public.finish_multiplayer_game((select code from test_multiplayer_codes where name = 'main'))), 'already_finished', 'finalisation idempotente');
reset role;
select is((select total_points from public.profiles where id = '50000000-0000-4000-8000-000000000002'), 10, 'pas de double credit');

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select lives_ok($$ insert into test_multiplayer_codes (name, code) select 'transfer', game_code from public.create_multiplayer_game('films', 2) $$, 'cree partie transfert');
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
select is((select result from public.join_multiplayer_game((select code from test_multiplayer_codes where name = 'transfer'))), 'joined', 'B rejoint transfert');
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
select is((select result from public.leave_multiplayer_game((select code from test_multiplayer_codes where name = 'transfer'))), 'left', 'hote quitte lobby');
reset role;
select is((select host_id from public.multiplayer_games where game_code = (select code from test_multiplayer_codes where name = 'transfer')), '50000000-0000-4000-8000-000000000002'::uuid, 'hote transfere au plus ancien restant');
select is((select current_players from public.multiplayer_games where game_code = (select code from test_multiplayer_codes where name = 'transfer')), 1, 'compteur apres depart hote');
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
select is((select result from public.leave_multiplayer_game((select code from test_multiplayer_codes where name = 'transfer'))), 'left', 'dernier joueur quitte');
reset role;
select is((select status from public.multiplayer_games where game_code = (select code from test_multiplayer_codes where name = 'transfer')), 'cancelled', 'partie annulee lorsque vide');

select ok(pg_get_functiondef('public.submit_multiplayer_answer(text,text,uuid)'::regprocedure) ~* 'for[[:space:]]+update', 'submit verrouille les lignes');
select ok(pg_get_functiondef('public.start_multiplayer_game(text)'::regprocedure) ~* 'for[[:space:]]+update', 'start verrouille la partie');
select ok(pg_get_functiondef('public.submit_multiplayer_answer(text,text,uuid)'::regprocedure) !~* 'execute[[:space:]]+', 'submit sans SQL dynamique');

select * from finish();

rollback;
