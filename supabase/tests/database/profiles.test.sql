-- Tests SQL Phase 2A.
-- A executer sur une base Supabase de test apres les migrations 001 a 003.

begin;

create extension if not exists pgtap with schema extensions;

select plan(46);

select is(public.clean_pseudo('  Abdoulaye  '), 'Abdoulaye', 'nettoie les espaces externes');
select is(public.clean_pseudo('Abdoulaye   Diallo'), 'Abdoulaye Diallo', 'reduit les espaces consecutifs');
select is(public.normalize_pseudo('  ABDOULAYE  '), 'abdoulaye', 'normalise en minuscules');
select is(public.normalize_pseudo('  Emilie  '), 'emilie', 'normalise sans accent');
select is(public.normalize_pseudo('  ÉMILIE  '), lower('ÉMILIE'), 'conserve les accents sans translitteration');
select throws_ok($$ select public.assert_valid_pseudo('     ') $$, '22023', 'pseudo_empty', 'refuse une valeur vide apres nettoyage');
select throws_ok($$ select public.assert_valid_pseudo('<b>Ali</b>') $$, '22023', 'pseudo_invalid_format', 'refuse le HTML');
select throws_ok($$ select public.assert_valid_pseudo('Ali!') $$, '22023', 'pseudo_invalid_format', 'refuse la ponctuation');
select throws_ok($$ select public.assert_valid_pseudo(E'Ali\nDia') $$, '22023', 'pseudo_invalid_format', 'refuse les retours a la ligne');

select throws_ok($$ select public.assert_valid_pseudo('Al') $$, '22023', 'pseudo_too_short', 'refuse 2 caracteres');
select is(public.assert_valid_pseudo('Ali'), 'Ali', 'accepte 3 caracteres');
select is(public.assert_valid_pseudo('abcdefghijklmnopqrst'), 'abcdefghijklmnopqrst', 'accepte 20 caracteres');
select throws_ok($$ select public.assert_valid_pseudo('abcdefghijklmnopqrstu') $$, '22023', 'pseudo_too_long', 'refuse 21 caracteres');
select is(public.assert_valid_pseudo('Alice'), 'Alice', 'accepte les lettres');
select is(public.assert_valid_pseudo('Alice 123'), 'Alice 123', 'accepte les chiffres et espaces');
select is(public.assert_valid_pseudo('Alice_123'), 'Alice_123', 'accepte les underscores');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase2a-1@example.test', 'x', now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase2a-2@example.test', 'x', now(), now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase2a-3@example.test', 'x', now(), now(), now());

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.register_profile('Abdoulaye') $$, '28000', 'not_authenticated', 'refuse la creation sans auth.uid()');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select lives_ok($$ select public.register_profile('  Abdoulaye  ') $$, 'cree le profil authentifie');
select is((select id from public.get_my_profile()), '11111111-1111-1111-1111-111111111111'::uuid, 'get_my_profile retourne le profil courant');
select is((select pseudo from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'Abdoulaye', 'conserve le pseudo affiche nettoye');
select is((select pseudo_normalized from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'abdoulaye', 'stocke le pseudo normalise');
select throws_ok($$ select public.register_profile('Abdoulaye') $$, '23505', 'profile_already_exists', 'refuse un deuxieme profil pour le meme utilisateur');

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select throws_ok($$ select public.register_profile('abdoulaye') $$, '23505', 'pseudo_already_taken', 'refuse un doublon avec casse differente');
select throws_ok($$ select public.register_profile('  Abdoulaye  ') $$, '23505', 'pseudo_already_taken', 'refuse un doublon avec espaces externes');
select throws_ok($$ select public.register_profile('Abdoulaye   ') $$, '23505', 'pseudo_already_taken', 'refuse un doublon normalise');
select lives_ok($$ select public.register_profile('Mariam_22') $$, 'cree un second profil distinct');

select results_eq(
  $$ select count(*)::int from public.profiles $$,
  $$ values (1) $$,
  'RLS limite la lecture au profil courant'
);

select throws_ok(
  $$ insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at)
     values ('33333333-3333-3333-3333-333333333333', 'Fake', 'fake', now()) $$,
  '42501',
  null,
  'refuse la creation directe avec un autre UUID'
);

select throws_ok($$ update public.profiles set pseudo = 'Hack' where id = '11111111-1111-1111-1111-111111111111' $$, '42501', null, 'refuse la modification directe du profil');
select throws_ok($$ delete from public.profiles where id = '11111111-1111-1111-1111-111111111111' $$, '42501', null, 'refuse la suppression physique');
select throws_ok($$ update public.profiles set total_points = 10 where id = '22222222-2222-2222-2222-222222222222' $$, '42501', null, 'refuse la modification directe des points');
select throws_ok($$ update public.profiles set quizzes_completed = 10 where id = '22222222-2222-2222-2222-222222222222' $$, '42501', null, 'refuse la modification directe des quiz completes');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.get_my_profile() $$, '28000', 'not_authenticated', 'get_my_profile refuse une session absente');

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select throws_ok($$ select public.get_my_profile() $$, 'P0002', 'profile_not_found', 'get_my_profile signale un profil absent');
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

select throws_ok($$ select public.change_my_pseudo('Mariam New') $$, 'P0001', 'pseudo_change_too_soon', 'refuse un changement avant 14 jours');

reset role;
update public.profiles
set created_at = now() - interval '16 days',
    pseudo_changed_at = now() - interval '15 days',
    updated_at = now() - interval '15 days'
where id = '22222222-2222-2222-2222-222222222222';

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select lives_ok($$ select public.change_my_pseudo('Mariam New') $$, 'accepte un changement apres 14 jours');
select ok((select pseudo_changed_at > now() - interval '1 minute' from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 'met a jour pseudo_changed_at cote serveur');

reset role;
update public.profiles
set created_at = now() - interval '16 days',
    pseudo_changed_at = now() - interval '15 days',
    updated_at = now() - interval '15 days'
where id = '22222222-2222-2222-2222-222222222222';

set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select throws_ok($$ select public.change_my_pseudo('ABDOULAYE') $$, '23505', 'pseudo_already_taken', 'renvoie proprement le conflit de pseudo');

reset role;
select throws_ok(
  $$ insert into public.profiles (id, pseudo, pseudo_normalized, total_points, pseudo_changed_at)
     values ('33333333-3333-3333-3333-333333333333', 'PointsBad', 'pointsbad', -1, now()) $$,
  '23514',
  null,
  'refuse total_points negatif'
);
select throws_ok(
  $$ insert into public.profiles (id, pseudo, pseudo_normalized, quizzes_completed, pseudo_changed_at)
     values ('33333333-3333-3333-3333-333333333333', 'QuizBad', 'quizbad', -1, now()) $$,
  '23514',
  null,
  'refuse quizzes_completed negatif'
);

select has_function('public', 'normalize_pseudo', array['text'], 'la fonction normalize_pseudo existe');
select has_function('public', 'register_profile', array['text'], 'la fonction register_profile existe');
select has_function('public', 'change_my_pseudo', array['text'], 'la fonction change_my_pseudo existe');
select has_function('public', 'get_my_profile', array[]::text[], 'la fonction get_my_profile existe');
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ),
  'la policy de lecture personnelle existe'
);

select ok(
  pg_get_functiondef('public.change_my_pseudo(text)'::regprocedure) ~* 'for[[:space:]]+update',
  'change_my_pseudo verrouille la ligne avec FOR UPDATE'
);

-- Test manuel de concurrence a executer sur deux sessions SQL de test:
-- Session A: ouvrir une transaction, appeler change_my_pseudo apres avoir vieilli pseudo_changed_at.
-- Session B: appeler change_my_pseudo pour le meme auth.uid() avant le commit de A.
-- Resultat attendu: B attend le verrou de A, puis echoue avec pseudo_change_too_soon.

select * from finish();

rollback;
