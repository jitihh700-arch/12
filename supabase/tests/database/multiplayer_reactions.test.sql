-- Tests SQL Phase 5.1: reactions multijoueur.

begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

create temp table test_reaction_codes (
  name text primary key,
  code text not null
) on commit drop;

grant all on test_reaction_codes to authenticated;

select ok(to_regclass('public.multiplayer_reactions') is not null, 'table reactions existe');
select ok(exists (select 1 from pg_constraint where conname = 'multiplayer_reactions_type_check'), 'types reactions contraints');
select ok((select relrowsecurity from pg_class where oid = 'public.multiplayer_reactions'::regclass), 'RLS activee reactions');
select ok(not has_table_privilege('authenticated', 'public.multiplayer_reactions', 'insert'), 'pas insertion directe reaction');
select ok(has_function_privilege('authenticated', 'public.create_multiplayer_reaction(text,text)', 'execute'), 'RPC reaction exposee');
select ok(not has_function_privilege('anon', 'public.create_multiplayer_reaction(text,text)', 'execute'), 'anon sans reaction');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p5-r-a@example.test', 'x', now(), now(), now()),
  ('51000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p5-r-b@example.test', 'x', now(), now(), now()),
  ('51000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p5-r-c@example.test', 'x', now(), now(), now());

insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at, created_at, updated_at)
values
  ('51000000-0000-4000-8000-000000000001', 'ReactA', 'reacta', now(), now(), now()),
  ('51000000-0000-4000-8000-000000000002', 'ReactB', 'reactb', now(), now(), now()),
  ('51000000-0000-4000-8000-000000000003', 'ReactC', 'reactc', now(), now(), now());

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.create_multiplayer_reaction('ABCDEF', 'like') $$, '28000', 'authentication_required', 'reaction refuse sans auth');

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
select lives_ok($$ insert into test_reaction_codes (name, code) select 'main', game_code from public.create_multiplayer_game('series', 2) $$, 'cree partie reactions');
select is((select result from public.create_multiplayer_reaction((select code from test_reaction_codes where name = 'main'), 'like')), 'sent', 'reaction like acceptee');
select is((select result from public.create_multiplayer_reaction((select code from test_reaction_codes where name = 'main'), 'heart')), 'sent', 'reaction heart acceptee');
select is((select result from public.create_multiplayer_reaction((select code from test_reaction_codes where name = 'main'), 'fire')), 'sent', 'reaction fire acceptee');
select is((select result from public.create_multiplayer_reaction((select code from test_reaction_codes where name = 'main'), 'party')), 'sent', 'reaction party acceptee');
select is((select result from public.create_multiplayer_reaction((select code from test_reaction_codes where name = 'main'), 'shocked')), 'sent', 'reaction shocked acceptee');
select throws_ok($$ select public.create_multiplayer_reaction((select code from test_reaction_codes where name = 'main'), 'smile') $$, '22023', 'invalid_reaction_type', 'type invalide refuse');
select throws_ok($$ select public.create_multiplayer_reaction((select code from test_reaction_codes where name = 'main'), 'like') $$, 'P0001', 'reaction_rate_limited', 'anti spam apres cinq reactions');
reset role;
select is((select count(*)::int from public.multiplayer_reactions where game_id = (select id from public.multiplayer_games where game_code = (select code from test_reaction_codes where name = 'main'))), 5, 'seulement cinq reactions stockees');

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000003', true);
select throws_ok($$ select public.create_multiplayer_reaction((select code from test_reaction_codes where name = 'main'), 'like') $$, '42501', 'not_a_player', 'non participant refuse');
select throws_ok($$ select public.create_multiplayer_reaction('ABCDEF', 'like') $$, 'P0002', 'game_not_found', 'partie absente refusee');

select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000002', true);
select is((select result from public.join_multiplayer_game((select code from test_reaction_codes where name = 'main'))), 'joined', 'B rejoint');
select is((select result from public.create_multiplayer_reaction((select code from test_reaction_codes where name = 'main'), 'fire')), 'sent', 'B peut reagir');
select is((select result from public.set_multiplayer_ready((select code from test_reaction_codes where name = 'main'), true)), 'ready_updated', 'B pret pour demarrer');
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);
select is((select result from public.start_multiplayer_game((select code from test_reaction_codes where name = 'main'))), 'started', 'partie demarree avant fin');
select is((select result from public.finish_multiplayer_game((select code from test_reaction_codes where name = 'main'))), 'finished', 'partie terminee');
select throws_ok($$ select public.create_multiplayer_reaction((select code from test_reaction_codes where name = 'main'), 'heart') $$, 'P0001', 'game_finished', 'reaction apres fin refusee');
reset role;
select is((select score from public.multiplayer_players where user_id = '51000000-0000-4000-8000-000000000001'), 0, 'reaction sans effet score');
select ok(
  not exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    join unnest(p.proargnames) as arg_name on true
    where n.nspname = 'public'
      and p.proname = 'create_multiplayer_reaction'
      and arg_name = 'user_id'
  ),
  'reaction RPC ne retourne pas user_id'
);

select * from finish();

rollback;
