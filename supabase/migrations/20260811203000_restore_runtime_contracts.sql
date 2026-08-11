-- Restaure les contrats runtime attendus par le frontend et les tests CI.
-- Cette migration est additive pour ne pas réécrire l'historique Supabase.

create or replace function public.assert_valid_pseudo(p_pseudo text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_clean text;
begin
  v_clean := public.clean_pseudo(p_pseudo);

  if char_length(v_clean) = 0 then
    raise exception 'pseudo_empty' using errcode = '22023';
  end if;

  if char_length(v_clean) < 3 then
    raise exception 'pseudo_too_short' using errcode = '22023';
  end if;

  if char_length(v_clean) > 20 then
    raise exception 'pseudo_too_long' using errcode = '22023';
  end if;

  if v_clean !~ '^[[:alnum:]_ ]+$' then
    raise exception 'pseudo_invalid_format' using errcode = '22023';
  end if;

  return v_clean;
end;
$$;

create or replace function public.register_profile(p_pseudo text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_pseudo text;
  v_pseudo_normalized text;
  v_profile public.profiles;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_pseudo := public.assert_valid_pseudo(p_pseudo);
  v_pseudo_normalized := public.normalize_pseudo(v_pseudo);

  if exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'profile_already_exists' using errcode = '23505';
  end if;

  if exists (select 1 from public.profiles where pseudo_normalized = v_pseudo_normalized) then
    raise exception 'pseudo_already_taken' using errcode = '23505';
  end if;

  insert into public.profiles (
    id,
    pseudo,
    pseudo_normalized,
    pseudo_changed_at
  )
  values (
    v_user_id,
    v_pseudo,
    v_pseudo_normalized,
    now()
  )
  returning * into v_profile;

  return v_profile;
exception
  when unique_violation then
    if exists (select 1 from public.profiles where id = v_user_id) then
      raise exception 'profile_already_exists' using errcode = '23505';
    end if;

    raise exception 'pseudo_already_taken' using errcode = '23505';
end;
$$;

create or replace function public.get_my_profile()
returns public.profiles
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_profile public.profiles;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  return v_profile;
end;
$$;

create or replace function public.change_my_pseudo(p_pseudo text)
returns table (
  id uuid,
  pseudo varchar(20),
  pseudo_normalized varchar(20),
  total_points integer,
  quizzes_completed integer,
  pseudo_changed_at timestamptz,
  next_pseudo_change_at timestamptz,
  last_played_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_profile public.profiles;
  v_pseudo text;
  v_pseudo_normalized text;
  v_now timestamptz;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select *
  into v_profile
  from public.profiles as p
  where p.id = v_user_id
  for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  v_now := now();

  if v_now < v_profile.pseudo_changed_at + interval '14 days' then
    raise exception 'pseudo_change_too_soon'
      using errcode = 'P0001',
      detail = (v_profile.pseudo_changed_at + interval '14 days')::text;
  end if;

  v_pseudo := public.assert_valid_pseudo(p_pseudo);
  v_pseudo_normalized := public.normalize_pseudo(v_pseudo);

  if exists (
    select 1
    from public.profiles as p
    where p.pseudo_normalized = v_pseudo_normalized
      and p.id <> v_user_id
  ) then
    raise exception 'pseudo_already_taken' using errcode = '23505';
  end if;

  update public.profiles as p
  set
    pseudo = v_pseudo,
    pseudo_normalized = v_pseudo_normalized,
    pseudo_changed_at = v_now
  where p.id = v_user_id
  returning
    p.id,
    p.pseudo,
    p.pseudo_normalized,
    p.total_points,
    p.quizzes_completed,
    p.pseudo_changed_at,
    p.pseudo_changed_at + interval '14 days',
    p.last_played_at,
    p.created_at,
    p.updated_at
  into
    id,
    pseudo,
    pseudo_normalized,
    total_points,
    quizzes_completed,
    pseudo_changed_at,
    next_pseudo_change_at,
    last_played_at,
    created_at,
    updated_at;

  return next;
exception
  when unique_violation then
    raise exception 'pseudo_already_taken' using errcode = '23505';
end;
$$;

alter table public.comments enable row level security;

revoke all on public.comments from public;
revoke all on public.comments from anon;
revoke all on public.comments from authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comments'
  ) then
    alter publication supabase_realtime drop table public.comments;
  end if;
end;
$$;

create or replace function public.broadcast_comment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pseudo varchar(20);
begin
  if tg_op = 'INSERT' and new.deleted_at is null then
    select p.pseudo
    into v_pseudo
    from public.profiles as p
    where p.id = new.user_id;

    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'user_id', new.user_id,
        'pseudo', v_pseudo,
        'content', new.content,
        'is_edited', new.is_edited,
        'created_at', new.created_at,
        'updated_at', new.updated_at
      ),
      'comment_created',
      'comments:public',
      true
    );

    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.deleted_at is null
     and new.deleted_at is not null then
    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'deleted_at', new.deleted_at
      ),
      'comment_deleted',
      'comments:public',
      true
    );

    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.deleted_at is null
     and (
       old.content is distinct from new.content
       or old.is_edited is distinct from new.is_edited
       or old.updated_at is distinct from new.updated_at
     ) then
    select p.pseudo
    into v_pseudo
    from public.profiles as p
    where p.id = new.user_id;

    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'user_id', new.user_id,
        'pseudo', v_pseudo,
        'content', new.content,
        'is_edited', new.is_edited,
        'created_at', new.created_at,
        'updated_at', new.updated_at
      ),
      'comment_updated',
      'comments:public',
      true
    );
  end if;

  return new;
exception
  when others then
    return coalesce(new, old);
end;
$$;

drop trigger if exists comments_broadcast_change on public.comments;

create trigger comments_broadcast_change
after insert or update on public.comments
for each row
execute function public.broadcast_comment_change();

drop policy if exists "comments_broadcast_receive_authenticated" on realtime.messages;

create policy "comments_broadcast_receive_authenticated"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() = 'comments:public'
);

create or replace function public.cleanup_expired_multiplayer_games()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.expire_multiplayer_games(clock_timestamp());
end;
$$;

revoke all on function public.clean_pseudo(text) from public;
revoke all on function public.normalize_pseudo(text) from public;
revoke all on function public.assert_valid_pseudo(text) from public;
revoke all on function public.register_profile(text) from public;
revoke all on function public.get_my_profile() from public;
revoke all on function public.change_my_pseudo(text) from public;
revoke all on function public.broadcast_comment_change() from public;
revoke all on function public.broadcast_comment_change() from anon;
revoke all on function public.broadcast_comment_change() from authenticated;
revoke all on function public.cleanup_expired_multiplayer_games() from public;

revoke insert on realtime.messages from public;
revoke insert on realtime.messages from anon;
revoke insert on realtime.messages from authenticated;

grant execute on function public.register_profile(text) to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.change_my_pseudo(text) to authenticated;
grant execute on function public.cleanup_expired_multiplayer_games() to service_role;
