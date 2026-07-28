-- Tests SQL Phase 4A: sessions de quiz et validation serveur.

begin;

create extension if not exists pgtap with schema extensions;

select plan(84);

create temp table test_quiz_ids (
  name text primary key,
  id uuid not null
) on commit drop;

grant all on test_quiz_ids to authenticated;

select ok(to_regnamespace('private') is not null, 'le schema private existe');
select ok(to_regclass('private.quiz_categories') is not null, 'la table privee quiz_categories existe');
select ok(to_regclass('private.quiz_answers') is not null, 'la table privee quiz_answers existe');
select ok(to_regclass('public.quiz_sessions') is not null, 'la table quiz_sessions existe');
select ok(to_regclass('public.quiz_session_answers') is not null, 'la table quiz_session_answers existe');
select ok(to_regclass('public.user_category_stats') is not null, 'la table user_category_stats existe');

select is((select count(*)::int from private.quiz_categories), 26, '26 categories importees');
select is((select count(*)::int from private.quiz_answers), 446, '446 reponses importees');
select results_eq(
  $$ select id from private.quiz_categories order by display_order limit 3 $$,
  $$ values ('series'::text), ('films'::text), ('animeCelebres'::text) $$,
  'ordre initial des categories conserve'
);
select is((select title from private.quiz_categories where id = 'series'), '📺 Séries TV - Top 20 des légendes', 'titre series conserve');
select is((select duration_seconds from private.quiz_categories where id = 'series'), 600, 'duree serveur de 600 secondes');
select is((select count(*)::int from private.quiz_answers where category_id = 'sportsMusique'), 40, 'sportsMusique contient 40 reponses');
select is((select count(*)::int from private.quiz_answers where category_id = 'ligueDesChampions'), 27, 'ligueDesChampions contient 27 reponses');
select is((select count(*)::int from private.quiz_answers where category_id = 'devinePersonnage'), 20, 'devinePersonnage contient 20 reponses');
select is((select count(*)::int from private.quiz_answers where category_id = 'devinePersonnage' and answer_normalized = 'naruto uzumaki'), 2, 'le doublon Naruto existant est preserve');
select is((select hint from private.quiz_answers where category_id = 'trouveAnime' and display_order = 1), '🏴‍☠️👒🍖', 'indice emoji conserve');
select is((select answer_year from private.quiz_answers where category_id = 'ballonDor' and display_order = 1), '2000', 'annee conservee');
select is((select answer_normalized from private.quiz_answers where category_id = 'ballonDor' and display_order = 3), 'ronaldo nazario', 'normalisation seed accentuee');

select is(private.normalize_quiz_answer('  Élodie  '), 'elodie', 'normalise casse accents et espaces externes');
select is(private.normalize_quiz_answer('2004 : FC Porto'), 'fc porto', 'retire le prefixe annee');
select is(private.normalize_quiz_answer('Shaquille O''Neal'), 'shaquille oneal', 'retire apostrophe');
select is(private.normalize_quiz_answer('Spider-Man'), 'spiderman', 'retire tiret');
select is(private.normalize_quiz_answer('Hunter × Hunter'), 'hunter  hunter', 'retire unicode sans compacter les espaces internes');
select is(private.normalize_quiz_answer('  A   B  '), 'a   b', 'conserve espaces consecutifs internes');
select is(private.normalize_quiz_answer(null), '', 'normalise null en vide');

select ok(not has_schema_privilege('authenticated', 'private', 'usage'), 'authenticated sans usage sur private');
select ok(not has_table_privilege('authenticated', 'private.quiz_answers', 'select'), 'authenticated ne lit pas quiz_answers');
select ok(not has_function_privilege('authenticated', 'private.normalize_quiz_answer(text)', 'execute'), 'normalize_quiz_answer non exposee');
select ok((select relrowsecurity from pg_class where oid = 'public.quiz_sessions'::regclass), 'RLS activee sur quiz_sessions');
select ok((select relrowsecurity from pg_class where oid = 'public.quiz_session_answers'::regclass), 'RLS activee sur quiz_session_answers');
select ok((select relrowsecurity from pg_class where oid = 'public.user_category_stats'::regclass), 'RLS activee sur user_category_stats');
select ok(not has_table_privilege('authenticated', 'public.quiz_sessions', 'insert'), 'authenticated sans insert direct session');
select ok(not has_table_privilege('authenticated', 'public.quiz_sessions', 'update'), 'authenticated sans update direct session');
select ok(not has_table_privilege('authenticated', 'public.quiz_session_answers', 'select'), 'authenticated sans select direct reponses session');
select ok(not has_table_privilege('authenticated', 'public.user_category_stats', 'update'), 'authenticated sans update direct stats categorie');
select ok(has_function_privilege('authenticated', 'public.start_quiz_session(text)', 'execute'), 'authenticated execute start_quiz_session');
select ok(has_function_privilege('authenticated', 'public.submit_quiz_answer(uuid,text)', 'execute'), 'authenticated execute submit_quiz_answer');
select ok(has_function_privilege('authenticated', 'public.complete_quiz_session(uuid)', 'execute'), 'authenticated execute complete_quiz_session');
select ok(has_function_privilege('authenticated', 'public.abandon_quiz_session(uuid)', 'execute'), 'authenticated execute abandon_quiz_session');
select ok(not has_function_privilege('anon', 'public.start_quiz_session(text)', 'execute'), 'anon sans RPC quiz');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4a-a@example.test', 'x', now(), now(), now()),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4a-b@example.test', 'x', now(), now(), now()),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4a-noprofile@example.test', 'x', now(), now(), now());

insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'QuizUserA', 'quizusera', now(), now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'QuizUserB', 'quizuserb', now(), now(), now());

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.start_quiz_session('series') $$, '28000', 'authentication_required', 'start refuse sans auth');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select throws_ok($$ select public.start_quiz_session('series') $$, 'P0002', 'profile_required', 'start refuse sans profil');
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.start_quiz_session('absente') $$, 'P0002', 'category_not_found', 'categorie inconnue refusee');

reset role;
update private.quiz_categories set is_active = false where id = 'films';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.start_quiz_session('films') $$, 'P0001', 'category_inactive', 'categorie inactive refusee');
reset role;
update private.quiz_categories set is_active = true where id = 'films';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok($$ insert into test_quiz_ids (name, id) select 'session_a', session_id from public.start_quiz_session('series') $$, 'cree une session');
select is((select status from public.get_my_quiz_session((select id from test_quiz_ids where name = 'session_a'))), 'active', 'session active lisible par proprietaire');
select is((select duration_seconds from public.get_my_quiz_session((select id from test_quiz_ids where name = 'session_a'))), 600, 'duree retournee par RPC');
select ok((select expires_at > started_at from public.get_my_quiz_session((select id from test_quiz_ids where name = 'session_a'))), 'expires_at apres started_at');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.get_my_quiz_session((select id from test_quiz_ids where name = 'session_a')) $$, '42501', 'session_forbidden', 'autre joueur ne lit pas la session');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok($$ insert into test_quiz_ids (name, id) select 'session_b', session_id from public.start_quiz_session('series') $$, 'redemarrer abandonne l ancienne session');
reset role;
select is((select status from public.quiz_sessions where id = (select id from test_quiz_ids where name = 'session_a')), 'abandoned', 'ancienne session abandonnee');
select is((select count(*)::int from public.quiz_sessions where user_id = '10000000-0000-4000-8000-000000000001' and status = 'active'), 1, 'une seule session active');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select throws_ok($$ select public.submit_quiz_answer((select id from test_quiz_ids where name = 'session_b'), '') $$, '22023', 'invalid_answer', 'reponse vide refusee');
select throws_ok($$ select public.submit_quiz_answer((select id from test_quiz_ids where name = 'session_b'), repeat('a', 201)) $$, '22023', 'answer_too_long', 'reponse trop longue refusee');
select is((select result from public.submit_quiz_answer((select id from test_quiz_ids where name = 'session_b'), 'Inconnu')), 'incorrect', 'mauvaise reponse controlee');
select is((select correct_answers from public.get_my_quiz_session((select id from test_quiz_ids where name = 'session_b'))), 0, 'mauvaise reponse sans point');
select is((select result from public.submit_quiz_answer((select id from test_quiz_ids where name = 'session_b'), 'Walter White')), 'correct', 'bonne reponse exacte');
select is((select points_current from public.get_my_quiz_session((select id from test_quiz_ids where name = 'session_b'))), 10, 'bonne reponse vaut 10 points serveur');
select is((select result from public.submit_quiz_answer((select id from test_quiz_ids where name = 'session_b'), 'Walter White')), 'duplicate', 'doublon ne rapporte rien');
select is((select result from public.submit_quiz_answer((select id from test_quiz_ids where name = 'session_b'), 'Snow')), 'correct', 'dernier mot accepte comme le JS');
select is((select result from public.submit_quiz_answer((select id from test_quiz_ids where name = 'session_b'), 'Sherlock')), 'correct', 'premier mot accepte comme le JS');
select is((select correct_answers from public.get_my_quiz_session((select id from test_quiz_ids where name = 'session_b'))), 3, 'trois bonnes reponses uniques');
select ok(not (select row_to_json(s)::jsonb ? 'answer_text' from public.submit_quiz_answer((select id from test_quiz_ids where name = 'session_b'), 'Rien') as s limit 1), 'submit ne revele pas answer_text');

select lives_ok($$ select public.complete_quiz_session((select id from test_quiz_ids where name = 'session_b')) $$, 'finalise une session active');
reset role;
select is((select status from public.quiz_sessions where id = (select id from test_quiz_ids where name = 'session_b')), 'completed', 'statut completed');
select is((select points_awarded from public.quiz_sessions where id = (select id from test_quiz_ids where name = 'session_b')), 30, 'points_awarded calcule cote serveur');
select is((select total_points from public.profiles where id = '10000000-0000-4000-8000-000000000001'), 30, 'profil credite');
select is((select quizzes_completed from public.profiles where id = '10000000-0000-4000-8000-000000000001'), 1, 'quiz complete incremente');
select is((select total_points from public.user_category_stats where user_id = '10000000-0000-4000-8000-000000000001' and category_id = 'series'), 30, 'stats categorie creditees');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select public.complete_quiz_session((select id from test_quiz_ids where name = 'session_b')) $$, 'complete idempotent');
reset role;
select is((select total_points from public.profiles where id = '10000000-0000-4000-8000-000000000001'), 30, 'second complete sans double credit');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.submit_quiz_answer((select id from test_quiz_ids where name = 'session_b'), 'Rick Grimes') $$, 'P0001', 'session_not_active', 'reponse apres finalisation refusee');
select throws_ok($$ update public.quiz_sessions set status = 'active' where id = (select id from test_quiz_ids where name = 'session_b') $$, '42501', null, 'reactivation directe refusee');

select lives_ok($$ insert into test_quiz_ids (name, id) select 'session_expired', session_id from public.start_quiz_session('series') $$, 'cree session a expirer');
reset role;
update public.quiz_sessions
set
  started_at = now() - interval '10 minutes',
  expires_at = now() - interval '1 second'
where id = (select id from test_quiz_ids where name = 'session_expired');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select result from public.submit_quiz_answer((select id from test_quiz_ids where name = 'session_expired'), 'Walter White')), 'expired', 'soumission apres expiration expire la session');
reset role;
select is((select status from public.quiz_sessions where id = (select id from test_quiz_ids where name = 'session_expired')), 'expired', 'statut expired pose');
select is((select points_awarded from public.quiz_sessions where id = (select id from test_quiz_ids where name = 'session_expired')), 0, 'expiration sans credit');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok($$ insert into test_quiz_ids (name, id) select 'session_abandon', session_id from public.start_quiz_session('series') $$, 'cree session a abandonner');
select is((select result from public.abandon_quiz_session((select id from test_quiz_ids where name = 'session_abandon'))), 'abandoned', 'abandon controle');
reset role;
select is((select points_awarded from public.quiz_sessions where id = (select id from test_quiz_ids where name = 'session_abandon')), 0, 'abandon sans credit');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select result from public.abandon_quiz_session((select id from test_quiz_ids where name = 'session_abandon'))), 'already_abandoned', 'abandon idempotent');

select ok(pg_get_functiondef('public.submit_quiz_answer(uuid,text)'::regprocedure) ~* 'for[[:space:]]+update', 'submit verrouille la session');
select ok(pg_get_functiondef('public.complete_quiz_session(uuid)'::regprocedure) ~* 'for[[:space:]]+update', 'complete verrouille la session');
select ok(pg_get_functiondef('public.submit_quiz_answer(uuid,text)'::regprocedure) !~* 'execute[[:space:]]+', 'submit sans SQL dynamique');

select * from finish();

rollback;
