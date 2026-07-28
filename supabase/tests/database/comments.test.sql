-- Tests SQL Phase 3A.
-- Les commentaires passent par des RPC et restent lies au profil courant.

begin;

create extension if not exists pgtap with schema extensions;

select plan(118);

create temp table test_comment_ids (
  name text primary key,
  id uuid not null
) on commit drop;

grant all on test_comment_ids to authenticated;

select ok(to_regclass('public.comments') is not null, 'la table comments existe');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'id' and data_type = 'uuid'), 'id est uuid');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'user_id' and data_type = 'uuid'), 'user_id est uuid');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'content' and data_type = 'text'), 'content est text');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'is_edited' and data_type = 'boolean'), 'is_edited est boolean');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'deleted_at' and data_type = 'timestamp with time zone'), 'deleted_at est timestamptz');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'created_at' and data_type = 'timestamp with time zone'), 'created_at est timestamptz');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'updated_at' and data_type = 'timestamp with time zone'), 'updated_at est timestamptz');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'id' and column_default like '%gen_random_uuid%'), 'id a gen_random_uuid par defaut');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'is_edited' and column_default = 'false'), 'is_edited vaut false par defaut');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'created_at' and column_default = 'now()'), 'created_at vient de PostgreSQL');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'comments' and column_name = 'updated_at' and column_default = 'now()'), 'updated_at vient de PostgreSQL');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.comments'::regclass and contype = 'p'), 'la cle primaire existe');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.comments'::regclass and conname = 'comments_user_id_fkey' and confrelid = 'public.profiles'::regclass), 'la FK vers profiles existe');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.comments'::regclass and conname = 'comments_content_clean_check'), 'contrainte contenu nettoye');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.comments'::regclass and conname = 'comments_content_not_empty_check'), 'contrainte contenu non vide');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.comments'::regclass and conname = 'comments_content_length_check'), 'contrainte longueur 500');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.comments'::regclass and conname = 'comments_updated_at_coherent_check'), 'contrainte updated_at coherente');
select ok(exists (select 1 from pg_constraint where conrelid = 'public.comments'::regclass and conname = 'comments_deleted_at_coherent_check'), 'contrainte deleted_at coherente');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'comments' and indexname = 'comments_created_at_desc_idx'), 'index tri created_at desc');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'comments' and indexname = 'comments_user_id_idx'), 'index user_id');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'comments' and indexname = 'comments_visible_created_at_desc_idx' and indexdef like '%WHERE (deleted_at IS NULL)%'), 'index partiel commentaires visibles');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'comments' and indexname = 'comments_active_user_id_idx' and indexdef like '%WHERE (deleted_at IS NULL)%'), 'index partiel quota actif');
select ok((select relrowsecurity from pg_class where oid = 'public.comments'::regclass), 'RLS activee sur comments');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.comments'::regclass and tgname = 'comments_set_updated_at'), 'trigger updated_at present');
select ok(not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'), 'comments absent de la publication Postgres Changes');

select is(public.clean_comment_content('  Bonjour  '), 'Bonjour', 'nettoie les espaces externes');
select throws_ok($$ select public.assert_valid_comment_content(null) $$, '22023', 'invalid_comment_content', 'refuse null');
select throws_ok($$ select public.assert_valid_comment_content('   ') $$, '22023', 'invalid_comment_content', 'refuse espaces seuls');
select is(char_length(public.assert_valid_comment_content(repeat('a', 500))), 500, 'accepte 500 caracteres');
select throws_ok($$ select public.assert_valid_comment_content(repeat('a', 501)) $$, '22023', 'comment_too_long', 'refuse 501 caracteres');
select is(public.assert_valid_comment_content('<script>alert(1)</script>'), '<script>alert(1)</script>', 'conserve le HTML comme texte');

select ok(not has_table_privilege('public', 'public.comments', 'select'), 'public sans select table');
select ok(not has_table_privilege('anon', 'public.comments', 'insert'), 'anon sans insert table');
select ok(not has_table_privilege('authenticated', 'public.comments', 'insert'), 'authenticated sans insert direct');
select ok(not has_table_privilege('authenticated', 'public.comments', 'update'), 'authenticated sans update direct');
select ok(not has_table_privilege('authenticated', 'public.comments', 'delete'), 'authenticated sans delete direct');
select ok(not has_table_privilege('authenticated', 'public.comments', 'select'), 'authenticated sans select direct sur comments');
select ok(has_function_privilege('authenticated', 'public.create_comment(text)', 'execute'), 'authenticated execute create_comment');
select ok(has_function_privilege('authenticated', 'public.list_comments(integer, integer)', 'execute'), 'authenticated execute list_comments');
select ok(has_function_privilege('authenticated', 'public.update_my_comment(uuid, text)', 'execute'), 'authenticated execute update_my_comment');
select ok(has_function_privilege('authenticated', 'public.delete_my_comment(uuid)', 'execute'), 'authenticated execute delete_my_comment');
select ok(not has_function_privilege('anon', 'public.create_comment(text)', 'execute'), 'anon ne peut pas executer create_comment');
select ok(not has_function_privilege('authenticated', 'public.clean_comment_content(text)', 'execute'), 'helper clean_comment_content non expose');
select ok(not has_function_privilege('authenticated', 'public.assert_valid_comment_content(text)', 'execute'), 'helper assert_valid_comment_content non expose');
select ok(not has_function_privilege('authenticated', 'public.comment_public_row(uuid)', 'execute'), 'helper comment_public_row non expose');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.comments'::regclass and tgname = 'comments_broadcast_change'), 'trigger Broadcast present');
select has_function('public', 'broadcast_comment_change', array[]::text[], 'fonction trigger Broadcast existe');
select ok(pg_get_functiondef('public.broadcast_comment_change()'::regprocedure) ~* 'SET search_path TO ''''', 'broadcast_comment_change a un search_path strict');
select ok(not has_function_privilege('public', 'public.broadcast_comment_change()', 'execute'), 'public ne peut pas executer broadcast_comment_change');
select ok(not has_function_privilege('anon', 'public.broadcast_comment_change()', 'execute'), 'anon ne peut pas executer broadcast_comment_change');
select ok(not has_function_privilege('authenticated', 'public.broadcast_comment_change()', 'execute'), 'authenticated ne peut pas executer broadcast_comment_change');
select ok(exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'comments_broadcast_receive_authenticated' and roles = '{authenticated}' and qual like '%comments:public%'), 'policy realtime.messages limitee au topic comments');
select ok(not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname = 'comments_broadcast_receive_authenticated' and roles && array['anon']::name[]), 'anon sans policy Broadcast comments');
select ok(not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and cmd = 'INSERT'), 'aucune policy insert client sur realtime.messages');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase3a-1@example.test', 'x', now(), now(), now()),
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase3a-2@example.test', 'x', now(), now(), now()),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase3a-3@example.test', 'x', now(), now(), now()),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'phase3a-4@example.test', 'x', now(), now(), now());

insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at)
values
  ('44444444-4444-4444-4444-444444444444', 'CommentUserA', 'commentusera', now()),
  ('55555555-5555-5555-5555-555555555555', 'CommentUserB', 'commentuserb', now()),
  ('77777777-7777-7777-7777-777777777777', 'LimitUser', 'limituser', now());

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$ select public.create_comment('Bonjour') $$, '28000', 'authentication_required', 'create_comment refuse sans session');
select throws_ok($$ select public.list_comments(50, 0) $$, '28000', 'authentication_required', 'list_comments refuse sans session');

set local role authenticated;
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', true);
select throws_ok($$ select public.create_comment('Sans profil') $$, 'P0002', 'profile_required', 'create_comment refuse sans profil');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select throws_ok($$ select count(*) from public.comments $$, '42501', null, 'select direct comments refuse a authenticated');
select throws_ok($$ insert into realtime.messages (topic, extension, payload, event, private) values ('comments:public', 'broadcast', '{}', 'comment_created', true) $$, '42501', null, 'injection Broadcast client refusee par RLS');
select lives_ok($$ select public.create_comment('  Premier commentaire  ') $$, 'cree un commentaire valide');
reset role;
insert into test_comment_ids (name, id)
select 'first', id from public.comments where content = 'Premier commentaire';
select is((select content from public.comments where user_id = '44444444-4444-4444-4444-444444444444' limit 1), 'Premier commentaire', 'stocke le contenu nettoye');
select is((select count(*)::int from public.comments where user_id = '44444444-4444-4444-4444-444444444444'), 1, 'cree une seule ligne');
select is((select user_id from public.comments where content = 'Premier commentaire'), '44444444-4444-4444-4444-444444444444'::uuid, 'user_id calcule cote serveur');
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select is((select pseudo from public.create_comment('Secondaire') limit 1), 'CommentUserA', 'retourne le pseudo actuel');
reset role;
select ok((select created_at is not null and updated_at is not null from public.comments where content = 'Premier commentaire'), 'dates calculees cote serveur');
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select throws_ok($$ select public.create_comment('') $$, '22023', 'invalid_comment_content', 'refuse contenu vide');
select throws_ok($$ select public.create_comment('   ') $$, '22023', 'invalid_comment_content', 'refuse contenu compose uniquement espaces');
select lives_ok($$ select public.create_comment(repeat('b', 500)) $$, 'accepte un commentaire de 500 caracteres');
select throws_ok($$ select public.create_comment(repeat('b', 501)) $$, '22023', 'comment_too_long', 'refuse un commentaire de 501 caracteres');
select lives_ok($$ select public.create_comment('<strong>Texte</strong>') $$, 'accepte le HTML stocke comme texte');
reset role;
select is((select content from public.comments where content like '<strong>%'), '<strong>Texte</strong>', 'HTML conserve sans interpretation SQL');
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

select throws_ok($$ insert into public.comments (user_id, content) values ('55555555-5555-5555-5555-555555555555', 'direct') $$, '42501', null, 'insert direct refuse');
select throws_ok($$ update public.comments set content = 'direct update' where user_id = '44444444-4444-4444-4444-444444444444' $$, '42501', null, 'update direct refuse');
select throws_ok($$ update public.comments set deleted_at = now() where user_id = '44444444-4444-4444-4444-444444444444' $$, '42501', null, 'deleted_at direct refuse');
select throws_ok($$ delete from public.comments where user_id = '44444444-4444-4444-4444-444444444444' $$, '42501', null, 'delete physique direct refuse');

reset role;
insert into public.comments (id, user_id, content, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '55555555-5555-5555-5555-555555555555', 'Ancien', now() - interval '2 minutes', now() - interval '2 minutes'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '55555555-5555-5555-5555-555555555555', 'Recent', now() - interval '1 minute', now() - interval '1 minute'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '55555555-5555-5555-5555-555555555555', 'Supprime', now(), now());
insert into test_comment_ids (name, id) values ('recent', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2');
update public.comments set deleted_at = clock_timestamp() where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
update public.comments
set created_at = now() - interval '3 seconds',
    updated_at = now() - interval '3 seconds'
where content = 'Premier commentaire';
update public.comments
set created_at = now() - interval '1 second',
    updated_at = now() - interval '1 second'
where content = 'Secondaire';
update public.comments
set created_at = now() - interval '2 seconds',
    updated_at = now() - interval '2 seconds'
where content = '<strong>Texte</strong>';
update public.comments
set created_at = now() - interval '5 seconds',
    updated_at = now() - interval '5 seconds'
where char_length(content) = 500;

set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select results_eq($$ select content from public.list_comments(2, 0) $$, $$ values ('Secondaire'::text), ('<strong>Texte</strong>'::text) $$, 'liste triee par created_at desc');
select results_eq($$ select content from public.list_comments(1, 1) $$, $$ values ('<strong>Texte</strong>'::text) $$, 'pagination offset fonctionne');
select throws_ok($$ select public.list_comments(0, 0) $$, '22023', 'invalid_pagination', 'refuse limite zero');
select throws_ok($$ select public.list_comments(101, 0) $$, '22023', 'invalid_pagination', 'refuse limite trop grande');
select throws_ok($$ select public.list_comments(50, -1) $$, '22023', 'invalid_pagination', 'refuse offset negatif');
select ok(not exists (select 1 from public.list_comments(50, 0) where content = 'Supprime'), 'list_comments exclut les commentaires supprimes');
select is((select pseudo from public.list_comments(50, 0) where content = 'Recent'), 'CommentUserB', 'list_comments retourne le pseudo actuel');
select ok(not (select row_to_json(lc)::jsonb ? 'pseudo_normalized' from public.list_comments(1, 0) as lc limit 1), 'list_comments ne retourne pas pseudo_normalized');
select ok(not (select row_to_json(lc)::jsonb ? 'deleted_at' from public.list_comments(1, 0) as lc limit 1), 'list_comments ne retourne pas deleted_at');

reset role;
select is((select is_edited from public.comments where content = 'Premier commentaire'), false, 'is_edited false avant modification');
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select lives_ok($$ select public.update_my_comment((select id from test_comment_ids where name = 'first'), 'Premier commentaire modifie') $$, 'proprietaire modifie son commentaire');
reset role;
select is((select content from public.comments where content = 'Premier commentaire modifie'), 'Premier commentaire modifie', 'contenu modifie');
select is((select is_edited from public.comments where content = 'Premier commentaire modifie'), true, 'is_edited true apres modification');
select ok((select updated_at > created_at from public.comments where content = 'Premier commentaire modifie'), 'updated_at avance apres modification');
select is((select user_id from public.comments where content = 'Premier commentaire modifie'), '44444444-4444-4444-4444-444444444444'::uuid, 'user_id inchange apres modification');
select ok((select created_at < clock_timestamp() from public.comments where content = 'Premier commentaire modifie'), 'created_at reste serveur et coherent');
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select lives_ok($$ select public.update_my_comment((select id from test_comment_ids where name = 'first'), 'Premier commentaire modifie') $$, 'modifier avec le meme contenu reste controle');

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select throws_ok($$ select public.update_my_comment((select id from test_comment_ids where name = 'first'), 'Vol') $$, '42501', 'comment_forbidden', 'autre utilisateur ne modifie pas');
select throws_ok($$ select public.delete_my_comment((select id from test_comment_ids where name = 'first')) $$, '42501', 'comment_forbidden', 'autre utilisateur ne supprime pas');

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select lives_ok($$ select public.delete_my_comment((select id from test_comment_ids where name = 'first')) $$, 'proprietaire supprime logiquement');
reset role;
select ok((select deleted_at is not null from public.comments where id = (select id from test_comment_ids where name = 'first')), 'deleted_at renseigne');
select is((select count(*)::int from public.comments where id = (select id from test_comment_ids where name = 'first')), 1, 'ligne toujours presente physiquement');
set local role authenticated;
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select ok(not exists (select 1 from public.list_comments(100, 0) where content = 'Premier commentaire modifie'), 'commentaire supprime absent de list_comments');
select throws_ok($$ select public.update_my_comment((select id from test_comment_ids where name = 'first'), 'Retour') $$, 'P0001', 'comment_deleted', 'commentaire supprime non modifiable');
select throws_ok($$ select public.delete_my_comment((select id from test_comment_ids where name = 'first')) $$, 'P0001', 'comment_deleted', 'second delete renvoie une erreur documentee');

select throws_ok($$ select public.update_my_comment('99999999-9999-9999-9999-999999999999', 'Absent') $$, 'P0002', 'comment_not_found', 'update absent controle');
select throws_ok($$ select public.delete_my_comment('99999999-9999-9999-9999-999999999999') $$, 'P0002', 'comment_not_found', 'delete absent controle');
select throws_ok($$ select public.update_my_comment((select id from test_comment_ids where name = 'recent'), '   ') $$, '22023', 'invalid_comment_content', 'update refuse contenu invalide');

reset role;
update public.profiles
set created_at = now() - interval '16 days',
    pseudo_changed_at = now() - interval '15 days',
    updated_at = now() - interval '15 days'
where id = '55555555-5555-5555-5555-555555555555';

set local role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select lives_ok($$ select public.change_my_pseudo('CommentUserBNew') $$, 'change le pseudo du commentateur');
select is((select pseudo from public.list_comments(100, 0) where content = 'Recent'), 'CommentUserBNew', 'ancien commentaire affiche le nouveau pseudo');

select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
select lives_ok($$ select public.create_comment('Limite ' || g::text) from generate_series(1, 50) as g $$, '50 commentaires actifs acceptes');
reset role;
select is((select count(*)::int from public.comments where user_id = '77777777-7777-7777-7777-777777777777' and deleted_at is null), 50, 'compte 50 commentaires actifs');
set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
select throws_ok($$ select public.create_comment('Limite 51') $$, 'P0001', 'comment_limit_reached', '51e commentaire refuse');
reset role;
insert into test_comment_ids (name, id)
select 'limit', id from public.comments where user_id = '77777777-7777-7777-7777-777777777777' and deleted_at is null limit 1;
set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);
select lives_ok($$ select public.delete_my_comment((select id from test_comment_ids where name = 'limit')) $$, 'soft delete libere une place');
select lives_ok($$ select public.create_comment('Nouvelle place') $$, 'nouvelle creation apres soft delete acceptee');
reset role;
select is((select count(*)::int from public.comments where user_id = '77777777-7777-7777-7777-777777777777' and deleted_at is null), 50, 'le total actif reste 50');

select ok(pg_get_functiondef('public.create_comment(text)'::regprocedure) ~* 'for[[:space:]]+update', 'create_comment verrouille le profil');
select ok(pg_get_functiondef('public.create_comment(text)'::regprocedure) !~* 'execute[[:space:]]+', 'create_comment sans SQL dynamique');
select ok(pg_get_functiondef('public.update_my_comment(uuid,text)'::regprocedure) !~* 'execute[[:space:]]+', 'update_my_comment sans SQL dynamique');
select ok(pg_get_functiondef('public.delete_my_comment(uuid)'::regprocedure) !~* 'delete[[:space:]]+from[[:space:]]+public.comments', 'delete_my_comment ne supprime pas physiquement');
select ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'comments_select_visible_for_realtime'), 'ancienne policy SELECT comments absente');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'comments' and cmd in ('INSERT', 'UPDATE', 'DELETE')), 0, 'aucune policy ecriture directe');

select * from finish();

rollback;
