-- Phase 3A: table des commentaires.
-- Le pseudo n'est pas duplique: il reste dans public.profiles.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_edited boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint comments_content_clean_check check (content = btrim(content)),
  constraint comments_content_not_empty_check check (char_length(content) > 0),
  constraint comments_content_length_check check (char_length(content) <= 500),
  constraint comments_updated_at_coherent_check check (updated_at >= created_at),
  constraint comments_deleted_at_coherent_check check (deleted_at is null or deleted_at >= created_at)
);

create index comments_created_at_desc_idx
  on public.comments (created_at desc, id desc);

create index comments_user_id_idx
  on public.comments (user_id);

create index comments_visible_created_at_desc_idx
  on public.comments (created_at desc, id desc)
  where deleted_at is null;

create index comments_active_user_id_idx
  on public.comments (user_id)
  where deleted_at is null;

create or replace function public.set_comment_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create trigger comments_set_updated_at
before update on public.comments
for each row
execute function public.set_comment_updated_at();

revoke all on function public.set_comment_updated_at() from public;

comment on table public.comments is
  'Commentaires utilisateurs lies aux profils Supabase. La suppression est logique via deleted_at.';

comment on index public.comments_created_at_desc_idx is
  'Prepare le tri public futur par date decroissante, avec id comme ordre stable.';

comment on index public.comments_user_id_idx is
  'Accelere les controles de propriete et les nettoyages lies a un profil.';

comment on index public.comments_visible_created_at_desc_idx is
  'Accelere list_comments et les flux visibles en ignorant les commentaires supprimes.';

comment on index public.comments_active_user_id_idx is
  'Accelere le comptage des commentaires actifs pour la limite de 50 par utilisateur.';
