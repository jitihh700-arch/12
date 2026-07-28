-- Phase 3A hardening: les commentaires quittent Postgres Changes.
-- Les lectures persistantes passent par list_comments; le temps reel passe par Broadcast prive.

drop policy if exists "comments_select_visible_for_realtime" on public.comments;

revoke select on public.comments from authenticated;

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

revoke all on function public.broadcast_comment_change() from public;
revoke all on function public.broadcast_comment_change() from anon;
revoke all on function public.broadcast_comment_change() from authenticated;

revoke insert on realtime.messages from public;
revoke insert on realtime.messages from anon;
revoke insert on realtime.messages from authenticated;

drop policy if exists "comments_broadcast_receive_authenticated" on realtime.messages;
drop policy if exists "comments_broadcast_no_client_insert" on realtime.messages;

create policy "comments_broadcast_receive_authenticated"
on realtime.messages
for select
to authenticated
using (
  realtime.topic() = 'comments:public'
);

-- Aucune policy insert n'est creee pour les clients.
-- Les messages sont emis par la fonction trigger via realtime.send().
