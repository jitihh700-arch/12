-- Phase 2A: socle des profils lies a Supabase Auth.
-- La table auth.users reste la source d'identite.

create or replace function public.clean_pseudo(input_pseudo text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(btrim(coalesce(input_pseudo, '')), ' {2,}', ' ', 'g');
$$;

create or replace function public.normalize_pseudo(input_pseudo text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(public.clean_pseudo(input_pseudo));
$$;

revoke all on function public.clean_pseudo(text) from public;
revoke all on function public.normalize_pseudo(text) from public;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  pseudo varchar(20) not null,
  pseudo_normalized varchar(20) not null,
  total_points integer not null default 0,
  quizzes_completed integer not null default 0,
  pseudo_changed_at timestamptz not null,
  last_played_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_total_points_nonnegative_check check (total_points >= 0),
  constraint profiles_quizzes_completed_nonnegative_check check (quizzes_completed >= 0),
  constraint profiles_pseudo_clean_check check (pseudo = public.clean_pseudo(pseudo)),
  constraint profiles_pseudo_length_check check (char_length(pseudo) between 3 and 20),
  constraint profiles_pseudo_format_check check (pseudo ~ '^[[:alnum:]_ ]+$'),
  constraint profiles_pseudo_normalized_check check (pseudo_normalized = public.normalize_pseudo(pseudo)),
  constraint profiles_pseudo_normalized_unique unique (pseudo_normalized),
  constraint profiles_updated_at_coherent_check check (updated_at >= created_at),
  constraint profiles_pseudo_changed_at_coherent_check check (pseudo_changed_at >= created_at),
  constraint profiles_last_played_at_coherent_check check (last_played_at is null or last_played_at >= created_at)
);

create index profiles_last_played_at_idx
  on public.profiles (last_played_at desc)
  where last_played_at is not null;

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profile_updated_at();

revoke all on function public.set_profile_updated_at() from public;

comment on table public.profiles is
  'Profils applicatifs lies a auth.users pour les joueurs anonymes puis eventuellement permanents.';

comment on column public.profiles.pseudo_normalized is
  'Pseudo nettoye puis passe en minuscules. Les accents sont conserves et ne sont pas translitteres.';
