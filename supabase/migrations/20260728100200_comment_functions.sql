-- Phase 3A: RPC controlees pour les commentaires.
-- Le client ne fournit jamais user_id, pseudo ni dates serveur.

create or replace function public.clean_comment_content(p_content text)
returns text
language sql
immutable
parallel safe
as $$
  select btrim(coalesce(p_content, ''));
$$;

create or replace function public.assert_valid_comment_content(p_content text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_content text;
begin
  v_content := public.clean_comment_content(p_content);

  if char_length(v_content) = 0 then
    raise exception 'invalid_comment_content' using errcode = '22023';
  end if;

  if char_length(v_content) > 500 then
    raise exception 'comment_too_long' using errcode = '22023';
  end if;

  return v_content;
end;
$$;

create or replace function public.comment_public_row(p_comment_id uuid)
returns table (
  comment_id uuid,
  user_id uuid,
  pseudo varchar(20),
  content text,
  is_edited boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id as comment_id,
    c.user_id,
    p.pseudo,
    c.content,
    c.is_edited,
    c.created_at,
    c.updated_at
  from public.comments as c
  join public.profiles as p on p.id = c.user_id
  where c.id = p_comment_id
    and c.deleted_at is null;
$$;

create or replace function public.create_comment(p_content text)
returns table (
  comment_id uuid,
  user_id uuid,
  pseudo varchar(20),
  content text,
  is_edited boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_content text;
  v_comment_id uuid;
  v_active_count integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  perform 1
  from public.profiles as p
  where p.id = v_user_id
  for update;

  if not found then
    raise exception 'profile_required' using errcode = 'P0002';
  end if;

  v_content := public.assert_valid_comment_content(p_content);

  select count(*)::integer
  into v_active_count
  from public.comments as c
  where c.user_id = v_user_id
    and c.deleted_at is null;

  if v_active_count >= 50 then
    raise exception 'comment_limit_reached' using errcode = 'P0001';
  end if;

  insert into public.comments (user_id, content)
  values (v_user_id, v_content)
  returning id into v_comment_id;

  return query select * from public.comment_public_row(v_comment_id);
end;
$$;

create or replace function public.list_comments(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  comment_id uuid,
  user_id uuid,
  pseudo varchar(20),
  content text,
  is_edited boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_limit integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception 'invalid_pagination' using errcode = '22023';
  end if;

  v_limit := p_limit;

  return query
  select
    c.id as comment_id,
    c.user_id,
    p.pseudo,
    c.content,
    c.is_edited,
    c.created_at,
    c.updated_at
  from public.comments as c
  join public.profiles as p on p.id = c.user_id
  where c.deleted_at is null
  order by c.created_at desc, c.id desc
  limit v_limit
  offset p_offset;
end;
$$;

create or replace function public.update_my_comment(
  p_comment_id uuid,
  p_content text
)
returns table (
  comment_id uuid,
  user_id uuid,
  pseudo varchar(20),
  content text,
  is_edited boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_content text;
  v_comment public.comments;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  v_content := public.assert_valid_comment_content(p_content);

  select *
  into v_comment
  from public.comments as c
  where c.id = p_comment_id
  for update;

  if not found then
    raise exception 'comment_not_found' using errcode = 'P0002';
  end if;

  if v_comment.user_id <> v_user_id then
    raise exception 'comment_forbidden' using errcode = '42501';
  end if;

  if v_comment.deleted_at is not null then
    raise exception 'comment_deleted' using errcode = 'P0001';
  end if;

  update public.comments as c
  set
    content = v_content,
    is_edited = case when c.content is distinct from v_content then true else c.is_edited end
  where c.id = p_comment_id;

  return query select * from public.comment_public_row(p_comment_id);
end;
$$;

create or replace function public.delete_my_comment(p_comment_id uuid)
returns table (
  comment_id uuid,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_comment public.comments;
  v_deleted_at timestamptz;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select *
  into v_comment
  from public.comments as c
  where c.id = p_comment_id
  for update;

  if not found then
    raise exception 'comment_not_found' using errcode = 'P0002';
  end if;

  if v_comment.user_id <> v_user_id then
    raise exception 'comment_forbidden' using errcode = '42501';
  end if;

  if v_comment.deleted_at is not null then
    raise exception 'comment_deleted' using errcode = 'P0001';
  end if;

  update public.comments as c
  set deleted_at = clock_timestamp()
  where c.id = p_comment_id
  returning c.deleted_at into v_deleted_at;

  comment_id := p_comment_id;
  deleted_at := v_deleted_at;
  return next;
end;
$$;

revoke all on function public.clean_comment_content(text) from public;
revoke all on function public.assert_valid_comment_content(text) from public;
revoke all on function public.comment_public_row(uuid) from public;
revoke all on function public.create_comment(text) from public;
revoke all on function public.list_comments(integer, integer) from public;
revoke all on function public.update_my_comment(uuid, text) from public;
revoke all on function public.delete_my_comment(uuid) from public;

grant execute on function public.create_comment(text) to authenticated;
grant execute on function public.list_comments(integer, integer) to authenticated;
grant execute on function public.update_my_comment(uuid, text) to authenticated;
grant execute on function public.delete_my_comment(uuid) to authenticated;
