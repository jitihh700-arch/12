-- Tests SQL Phase 4B: restauration frontend et credit controle a la fin du timer.

begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

create temp table test_phase4b_ids (
  name text primary key,
  id uuid not null
) on commit drop;

grant all on test_phase4b_ids to authenticated;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('40000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4b-a@example.test', 'x', now(), now(), now()),
  ('40000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase4b-b@example.test', 'x', now(), now(), now());

insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at, created_at, updated_at)
values
  ('40000000-0000-4000-8000-000000000001', 'Phase4BA', 'phase4ba', now(), now(), now()),
  ('40000000-0000-4000-8000-000000000002', 'Phase4BB', 'phase4bb', now(), now(), now());

select ok(has_function_privilege('authenticated', 'public.get_my_quiz_session_state(uuid)', 'execute'), 'authenticated execute get_my_quiz_session_state');
select ok(not has_function_privilege('anon', 'public.get_my_quiz_session_state(uuid)', 'execute'), 'anon sans get_my_quiz_session_state');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select lives_ok($$ insert into test_phase4b_ids (name, id) select 'state_session', session_id from public.start_quiz_session('series') $$, 'session state creee');
select is((select result from public.submit_quiz_answer((select id from test_phase4b_ids where name = 'state_session'), 'Walter White')), 'correct', 'submit retourne correct');
select is((select matched_answer_display from public.submit_quiz_answer((select id from test_phase4b_ids where name = 'state_session'), 'Walter White')), 'Walter White', 'duplicate retourne la reponse deja trouvee');
select is((select matched_display_order from public.submit_quiz_answer((select id from test_phase4b_ids where name = 'state_session'), 'Walter White')), 1, 'duplicate retourne ordre public');
select is((select result from public.submit_quiz_answer((select id from test_phase4b_ids where name = 'state_session'), 'Inconnu')), 'incorrect', 'incorrect reste controle');
select is((select matched_answer_display from public.submit_quiz_answer((select id from test_phase4b_ids where name = 'state_session'), 'Inconnu')), null, 'incorrect ne revele aucune reponse');

select is((select count(*)::int from public.get_my_quiz_session_state((select id from test_phase4b_ids where name = 'state_session')) where found_answer_display is not null), 1, 'etat restaure une seule reponse trouvee');
select is((select found_answer_display from public.get_my_quiz_session_state((select id from test_phase4b_ids where name = 'state_session')) where found_display_order = 1), 'Walter White', 'etat expose le texte trouve');
select is((select found_display_order from public.get_my_quiz_session_state((select id from test_phase4b_ids where name = 'state_session')) where found_answer_display = 'Walter White'), 1, 'etat expose ordre trouve');
select ok(not (select row_to_json(s)::jsonb ? 'answer_normalized' from public.get_my_quiz_session_state((select id from test_phase4b_ids where name = 'state_session')) as s limit 1), 'etat ne revele pas normalisation');
select ok(not (select row_to_json(s)::jsonb ? 'answer_id' from public.get_my_quiz_session_state((select id from test_phase4b_ids where name = 'state_session')) as s limit 1), 'etat ne revele pas answer_id');
select ok(not (select row_to_json(s)::jsonb ? 'remaining_answers' from public.get_my_quiz_session_state((select id from test_phase4b_ids where name = 'state_session')) as s limit 1), 'etat ne revele pas les restantes');

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.get_my_quiz_session_state((select id from test_phase4b_ids where name = 'state_session')) $$, '42501', 'session_forbidden', 'autre joueur ne restaure pas la session');
select throws_ok($$ select public.submit_quiz_answer((select id from test_phase4b_ids where name = 'state_session'), 'Jesse Pinkman') $$, '42501', 'session_forbidden', 'autre joueur ne soumet pas');
select throws_ok($$ select public.complete_quiz_session((select id from test_phase4b_ids where name = 'state_session')) $$, '42501', 'session_forbidden', 'autre joueur ne finalise pas');

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select lives_ok($$ insert into test_phase4b_ids (name, id) select 'timer_grace', session_id from public.start_quiz_session('series') $$, 'session timer grace creee');
select is((select result from public.submit_quiz_answer((select id from test_phase4b_ids where name = 'timer_grace'), 'Tony Soprano')), 'correct', 'bonne reponse avant fin');
reset role;
update public.quiz_sessions
set
  started_at = now() - interval '10 minutes',
  expires_at = now() - interval '2 seconds'
where id = (select id from test_phase4b_ids where name = 'timer_grace');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select is((select result from public.complete_quiz_session((select id from test_phase4b_ids where name = 'timer_grace'))), 'completed', 'fin chrono proche credite');
reset role;
select is((select points_awarded from public.quiz_sessions where id = (select id from test_phase4b_ids where name = 'timer_grace')), 10, 'points timer credites une fois');
select is((select total_points from public.profiles where id = '40000000-0000-4000-8000-000000000001'), 10, 'profil credite par fin chrono');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select is((select result from public.complete_quiz_session((select id from test_phase4b_ids where name = 'timer_grace'))), 'already_completed', 'fin chrono idempotente');
reset role;
select is((select total_points from public.profiles where id = '40000000-0000-4000-8000-000000000001'), 10, 'pas de double credit timer');

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select lives_ok($$ insert into test_phase4b_ids (name, id) select 'timer_late', session_id from public.start_quiz_session('series') $$, 'session timer tardive creee');
select is((select result from public.submit_quiz_answer((select id from test_phase4b_ids where name = 'timer_late'), 'Rick Grimes')), 'correct', 'reponse avant fin tardive');
reset role;
update public.quiz_sessions
set
  started_at = now() - interval '10 minutes',
  expires_at = now() - interval '10 seconds'
where id = (select id from test_phase4b_ids where name = 'timer_late');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
select is((select result from public.complete_quiz_session((select id from test_phase4b_ids where name = 'timer_late'))), 'expired', 'appel trop tardif expire sans credit');

select * from finish();

rollback;
