-- Phase 4A: socle prive du quiz et sessions serveur.
-- Les reponses canoniques restent hors de la surface Data API.

create extension if not exists unaccent with schema extensions;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create or replace function private.normalize_quiz_answer(p_answer text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(
        extensions.unaccent(
          regexp_replace(lower(coalesce(p_answer, '')), '^\d{4}\s*:\s*', '')
        ),
        '[^a-z0-9\s]',
        '',
        'g'
      ),
      '[\u0300-\u036f]',
      '',
      'g'
    )
  );
$$;

create table private.quiz_categories (
  id text primary key,
  title text not null,
  description text,
  duration_seconds integer not null,
  is_active boolean not null default true,
  display_order integer not null,
  created_at timestamptz not null default now(),

  constraint quiz_categories_duration_positive_check check (duration_seconds > 0),
  constraint quiz_categories_display_order_positive_check check (display_order > 0),
  constraint quiz_categories_display_order_unique unique (display_order)
);

create table private.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references private.quiz_categories(id) on delete cascade,
  answer_text text not null,
  answer_normalized text not null,
  hint text,
  answer_year text,
  display_order integer not null,
  created_at timestamptz not null default now(),

  constraint quiz_answers_text_not_empty_check check (char_length(answer_text) > 0),
  constraint quiz_answers_normalized_not_empty_check check (char_length(answer_normalized) > 0),
  constraint quiz_answers_display_order_positive_check check (display_order > 0),
  constraint quiz_answers_order_unique unique (category_id, display_order),
  constraint quiz_answers_normalized_order_unique unique (category_id, answer_normalized, display_order)
);

create index quiz_answers_category_id_idx
  on private.quiz_answers (category_id, display_order);

create index quiz_answers_normalized_idx
  on private.quiz_answers (category_id, answer_normalized, display_order);

create index quiz_answers_first_word_idx
  on private.quiz_answers (category_id, split_part(answer_normalized, ' ', 1), display_order);

create index quiz_answers_last_word_idx
  on private.quiz_answers (category_id, (regexp_replace(answer_normalized, '^.*\s', '')), display_order);

revoke all on private.quiz_categories from public;
revoke all on private.quiz_categories from anon;
revoke all on private.quiz_categories from authenticated;
revoke all on private.quiz_answers from public;
revoke all on private.quiz_answers from anon;
revoke all on private.quiz_answers from authenticated;

create table public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id text not null references private.quiz_categories(id),
  status text not null,
  duration_seconds integer not null,
  correct_answers integer not null default 0,
  points_awarded integer not null default 0,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  abandoned_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quiz_sessions_status_check check (status in ('active', 'completed', 'expired', 'abandoned')),
  constraint quiz_sessions_duration_positive_check check (duration_seconds > 0),
  constraint quiz_sessions_correct_answers_nonnegative_check check (correct_answers >= 0),
  constraint quiz_sessions_points_awarded_nonnegative_check check (points_awarded >= 0),
  constraint quiz_sessions_completed_points_check check (status <> 'completed' or points_awarded = correct_answers * 10),
  constraint quiz_sessions_uncredited_terminal_check check (status = 'completed' or points_awarded = 0),
  constraint quiz_sessions_expires_after_start_check check (expires_at > started_at),
  constraint quiz_sessions_completed_at_check check ((status = 'completed') = (completed_at is not null)),
  constraint quiz_sessions_abandoned_at_check check ((status = 'abandoned') = (abandoned_at is not null)),
  constraint quiz_sessions_expired_dates_check check (status <> 'expired' or (completed_at is null and abandoned_at is null))
);

create index quiz_sessions_user_id_idx
  on public.quiz_sessions (user_id, created_at desc);

create index quiz_sessions_category_id_idx
  on public.quiz_sessions (category_id);

create index quiz_sessions_status_idx
  on public.quiz_sessions (status);

create index quiz_sessions_expires_at_idx
  on public.quiz_sessions (expires_at)
  where status = 'active';

create index quiz_sessions_history_idx
  on public.quiz_sessions (user_id, completed_at desc, id)
  where status = 'completed';

create unique index quiz_sessions_one_active_per_user_idx
  on public.quiz_sessions (user_id)
  where status = 'active';

create table public.quiz_session_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  answer_id uuid not null references private.quiz_answers(id),
  submitted_normalized text not null,
  answered_at timestamptz not null default now(),

  constraint quiz_session_answers_normalized_not_empty_check check (char_length(submitted_normalized) > 0),
  constraint quiz_session_answers_session_answer_unique unique (session_id, answer_id)
);

create index quiz_session_answers_session_id_idx
  on public.quiz_session_answers (session_id, answered_at);

create table public.user_category_stats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id text not null references private.quiz_categories(id),
  total_points integer not null default 0,
  correct_answers integer not null default 0,
  quizzes_completed integer not null default 0,
  last_played_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id),

  constraint user_category_stats_total_points_nonnegative_check check (total_points >= 0),
  constraint user_category_stats_correct_answers_nonnegative_check check (correct_answers >= 0),
  constraint user_category_stats_quizzes_completed_nonnegative_check check (quizzes_completed >= 0),
  constraint user_category_stats_updated_at_check check (updated_at >= created_at),
  constraint user_category_stats_last_played_at_check check (last_played_at is null or last_played_at >= created_at)
);

create index user_category_stats_category_points_idx
  on public.user_category_stats (category_id, total_points desc, last_played_at desc);

create or replace function public.set_quiz_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create trigger quiz_sessions_set_updated_at
before update on public.quiz_sessions
for each row
execute function public.set_quiz_updated_at();

create trigger user_category_stats_set_updated_at
before update on public.user_category_stats
for each row
execute function public.set_quiz_updated_at();

create or replace function public.prevent_quiz_session_reactivation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('completed', 'expired', 'abandoned') and new.status = 'active' then
    raise exception 'session_not_active' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger quiz_sessions_prevent_reactivation
before update on public.quiz_sessions
for each row
execute function public.prevent_quiz_session_reactivation();

alter table public.quiz_sessions enable row level security;
alter table public.quiz_session_answers enable row level security;
alter table public.user_category_stats enable row level security;

revoke all on public.quiz_sessions from public;
revoke all on public.quiz_sessions from anon;
revoke all on public.quiz_sessions from authenticated;
revoke all on public.quiz_session_answers from public;
revoke all on public.quiz_session_answers from anon;
revoke all on public.quiz_session_answers from authenticated;
revoke all on public.user_category_stats from public;
revoke all on public.user_category_stats from anon;
revoke all on public.user_category_stats from authenticated;

revoke all on function private.normalize_quiz_answer(text) from public;
revoke all on function public.set_quiz_updated_at() from public;
revoke all on function public.prevent_quiz_session_reactivation() from public;
revoke all on function public.set_quiz_updated_at() from anon;
revoke all on function public.prevent_quiz_session_reactivation() from anon;
revoke all on function public.set_quiz_updated_at() from authenticated;
revoke all on function public.prevent_quiz_session_reactivation() from authenticated;

comment on table private.quiz_categories is
  'Catalogue canonique prive des categories du quiz Memoriz.';

comment on table private.quiz_answers is
  'Reponses canoniques privees utilisees pour la validation serveur.';

comment on table public.quiz_sessions is
  'Sessions de quiz liees au profil courant et creditees par RPC seulement.';

comment on table public.quiz_session_answers is
  'Bonnes reponses trouvees par session, stockees avec la valeur normalisee.';

comment on table public.user_category_stats is
  'Aggregats par joueur et categorie, mis a jour pendant la finalisation serveur.';
