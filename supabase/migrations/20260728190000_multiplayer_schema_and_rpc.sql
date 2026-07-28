-- Phase 5.1: fondation database du mode multijoueur.
-- Le serveur applicatif appelle ces RPC avec le JWT Supabase du joueur.

create table public.multiplayer_games (
  id uuid primary key default gen_random_uuid(),
  game_code varchar(6) not null unique,
  host_id uuid not null references public.profiles(id),
  category_id text not null references private.quiz_categories(id),
  status text not null,
  max_players integer not null default 4,
  current_players integer not null default 1,
  duration_seconds integer not null,
  started_at timestamptz,
  expires_at timestamptz,
  finished_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 0,

  constraint multiplayer_games_code_length_check check (char_length(game_code) = 6),
  constraint multiplayer_games_code_format_check check (game_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  constraint multiplayer_games_status_check check (status in ('waiting', 'playing', 'finished', 'expired', 'cancelled')),
  constraint multiplayer_games_max_players_check check (max_players between 2 and 4),
  constraint multiplayer_games_current_players_check check (current_players between 0 and max_players),
  constraint multiplayer_games_duration_positive_check check (duration_seconds > 0),
  constraint multiplayer_games_started_dates_check check (
    (status in ('waiting', 'cancelled') and started_at is null)
    or (status in ('playing', 'finished', 'expired') and started_at is not null)
  ),
  constraint multiplayer_games_expires_after_created_check check (expires_at is null or expires_at > created_at),
  constraint multiplayer_games_expires_after_started_check check (started_at is null or expires_at is null or expires_at > started_at),
  constraint multiplayer_games_finished_dates_check check (
    (status in ('finished', 'expired', 'cancelled') and finished_at is not null)
    or (status in ('waiting', 'playing') and finished_at is null)
  ),
  constraint multiplayer_games_updated_at_check check (updated_at >= created_at),
  constraint multiplayer_games_activity_check check (last_activity_at >= created_at)
);

create index multiplayer_games_code_idx
  on public.multiplayer_games (game_code);

create index multiplayer_games_status_expires_idx
  on public.multiplayer_games (status, expires_at);

create index multiplayer_games_host_status_idx
  on public.multiplayer_games (host_id, status);

create table public.multiplayer_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.multiplayer_games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null default 0,
  correct_answers integer not null default 0,
  is_ready boolean not null default false,
  is_connected boolean not null default true,
  joined_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_activity_at timestamptz not null default now(),
  finished_at timestamptz,
  left_at timestamptz,
  leave_reason text,
  points_awarded integer not null default 0,
  global_credit_awarded_at timestamptz,

  constraint multiplayer_players_unique_user unique (game_id, user_id),
  constraint multiplayer_players_score_nonnegative_check check (score >= 0),
  constraint multiplayer_players_correct_nonnegative_check check (correct_answers >= 0),
  constraint multiplayer_players_score_consistent_check check (score = correct_answers * 10),
  constraint multiplayer_players_points_awarded_nonnegative_check check (points_awarded >= 0),
  constraint multiplayer_players_points_awarded_consistent_check check (points_awarded = 0 or points_awarded = score),
  constraint multiplayer_players_disconnect_check check (is_connected or disconnected_at is not null),
  constraint multiplayer_players_left_reason_check check (leave_reason is null or leave_reason in ('voluntary', 'host_transfer', 'cancelled')),
  constraint multiplayer_players_finished_after_join_check check (finished_at is null or finished_at >= joined_at),
  constraint multiplayer_players_left_after_join_check check (left_at is null or left_at >= joined_at)
);

create index multiplayer_players_game_rank_idx
  on public.multiplayer_players (game_id, score desc, finished_at asc nulls last, joined_at asc, user_id);

create index multiplayer_players_user_game_idx
  on public.multiplayer_players (user_id, game_id);

create table public.multiplayer_answers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.multiplayer_games(id) on delete cascade,
  player_id uuid not null references public.multiplayer_players(id) on delete cascade,
  answer_id uuid not null references private.quiz_answers(id),
  submitted_normalized text not null,
  answered_at timestamptz not null default now(),
  client_submission_id uuid,

  constraint multiplayer_answers_unique_answer unique (game_id, player_id, answer_id),
  constraint multiplayer_answers_normalized_not_empty_check check (char_length(submitted_normalized) > 0)
);

create unique index multiplayer_answers_client_submission_idx
  on public.multiplayer_answers (player_id, client_submission_id)
  where client_submission_id is not null;

create index multiplayer_answers_game_player_time_idx
  on public.multiplayer_answers (game_id, player_id, answered_at);

create table public.multiplayer_reactions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.multiplayer_games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null,
  created_at timestamptz not null default now(),

  constraint multiplayer_reactions_type_check check (reaction_type in ('like', 'heart', 'fire', 'party', 'shocked'))
);

create index multiplayer_reactions_rate_idx
  on public.multiplayer_reactions (game_id, user_id, created_at desc);

create trigger multiplayer_games_set_updated_at
before update on public.multiplayer_games
for each row
execute function public.set_quiz_updated_at();

alter table public.multiplayer_games enable row level security;
alter table public.multiplayer_players enable row level security;
alter table public.multiplayer_answers enable row level security;
alter table public.multiplayer_reactions enable row level security;

revoke all on public.multiplayer_games from public;
revoke all on public.multiplayer_games from anon;
revoke all on public.multiplayer_games from authenticated;
revoke all on public.multiplayer_players from public;
revoke all on public.multiplayer_players from anon;
revoke all on public.multiplayer_players from authenticated;
revoke all on public.multiplayer_answers from public;
revoke all on public.multiplayer_answers from anon;
revoke all on public.multiplayer_answers from authenticated;
revoke all on public.multiplayer_reactions from public;
revoke all on public.multiplayer_reactions from anon;
revoke all on public.multiplayer_reactions from authenticated;

create or replace function private.generate_multiplayer_game_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * char_length(v_chars))::integer, 1);
    end loop;

    if not exists (
      select 1
      from public.multiplayer_games as mg
      where mg.game_code = v_code
    ) then
      return v_code;
    end if;
  end loop;

  raise exception 'game_code_generation_failed' using errcode = 'P0001';
end;
$$;

create or replace function private.match_multiplayer_answer(
  p_category_id text,
  p_game_id uuid,
  p_player_id uuid,
  p_answer_normalized text
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select qa.id
  from private.quiz_answers as qa
  where qa.category_id = p_category_id
    and not exists (
      select 1
      from public.multiplayer_answers as ma
      where ma.game_id = p_game_id
        and ma.player_id = p_player_id
        and ma.answer_id = qa.id
    )
    and (
      qa.answer_normalized = p_answer_normalized
      or (
        split_part(qa.answer_normalized, ' ', 1) = p_answer_normalized
        and char_length(split_part(qa.answer_normalized, ' ', 1)) > 2
      )
      or (
        array_length(string_to_array(qa.answer_normalized, ' '), 1) > 1
        and char_length(regexp_replace(qa.answer_normalized, '^.*\s', '')) > 2
        and regexp_replace(qa.answer_normalized, '^.*\s', '') = p_answer_normalized
      )
    )
  order by qa.display_order
  limit 1;
$$;

create or replace function private.credit_multiplayer_player_locked(
  p_player_id uuid,
  p_category_id text,
  p_now timestamptz
)
returns public.multiplayer_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.multiplayer_players;
begin
  select *
  into v_player
  from public.multiplayer_players as mp
  where mp.id = p_player_id
  for update;

  if not found then
    raise exception 'player_not_found' using errcode = 'P0002';
  end if;

  if v_player.global_credit_awarded_at is not null then
    return v_player;
  end if;

  update public.multiplayer_players as mp
  set
    points_awarded = mp.score,
    global_credit_awarded_at = p_now,
    finished_at = coalesce(mp.finished_at, p_now),
    last_activity_at = p_now
  where mp.id = p_player_id
  returning * into v_player;

  update public.profiles as p
  set
    total_points = p.total_points + v_player.score,
    quizzes_completed = p.quizzes_completed + case when v_player.correct_answers > 0 then 1 else 0 end,
    last_played_at = p_now
  where p.id = v_player.user_id;

  insert into public.user_category_stats (
    user_id,
    category_id,
    total_points,
    correct_answers,
    quizzes_completed,
    last_played_at
  )
  values (
    v_player.user_id,
    p_category_id,
    v_player.score,
    v_player.correct_answers,
    case when v_player.correct_answers > 0 then 1 else 0 end,
    p_now
  )
  on conflict (user_id, category_id) do update
  set
    total_points = public.user_category_stats.total_points + excluded.total_points,
    correct_answers = public.user_category_stats.correct_answers + excluded.correct_answers,
    quizzes_completed = public.user_category_stats.quizzes_completed + excluded.quizzes_completed,
    last_played_at = excluded.last_played_at;

  return v_player;
end;
$$;

create or replace function private.finish_multiplayer_game_locked(
  p_game_id uuid,
  p_now timestamptz,
  p_status text default 'finished'
)
returns public.multiplayer_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.multiplayer_games;
  v_player record;
begin
  if p_status not in ('finished', 'expired', 'cancelled') then
    raise exception 'invalid_game_status' using errcode = '22023';
  end if;

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.id = p_game_id
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if v_game.status in ('finished', 'expired', 'cancelled') then
    return v_game;
  end if;

  update public.multiplayer_games as mg
  set
    status = p_status,
    finished_at = p_now,
    last_activity_at = p_now,
    version = mg.version + 1
  where mg.id = p_game_id
  returning * into v_game;

  if p_status in ('finished', 'expired') then
    for v_player in
      select id
      from public.multiplayer_players
      where game_id = p_game_id
        and left_at is null
      order by joined_at, id
      for update
    loop
      perform private.credit_multiplayer_player_locked(v_player.id, v_game.category_id, p_now);
    end loop;
  end if;

  return v_game;
end;
$$;

create or replace function private.transfer_multiplayer_host_locked(
  p_game_id uuid,
  p_now timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_host uuid;
begin
  perform 1
  from public.multiplayer_games as mg
  where mg.id = p_game_id
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  select mp.user_id
  into v_new_host
  from public.multiplayer_players as mp
  where mp.game_id = p_game_id
    and mp.left_at is null
    and mp.is_connected
  order by mp.joined_at, mp.id
  limit 1
  for update;

  if v_new_host is null then
    update public.multiplayer_games as mg
    set
      status = 'cancelled',
      current_players = 0,
      finished_at = p_now,
      last_activity_at = p_now,
      version = mg.version + 1
    where mg.id = p_game_id;
    return null;
  end if;

  update public.multiplayer_games as mg
  set
    host_id = v_new_host,
    last_activity_at = p_now,
    version = mg.version + 1
  where mg.id = p_game_id;

  return v_new_host;
end;
$$;

create or replace function private.expire_multiplayer_games(p_now timestamptz default clock_timestamp())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game record;
  v_count integer := 0;
begin
  for v_game in
    select id, status
    from public.multiplayer_games
    where (
        status = 'waiting'
        and last_activity_at < p_now - interval '30 minutes'
      )
      or (
        status = 'playing'
        and expires_at <= p_now
      )
    order by created_at
    for update
  loop
    perform private.finish_multiplayer_game_locked(v_game.id, p_now, 'expired');
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function private.assert_multiplayer_profile()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
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

  return v_user_id;
end;
$$;

create or replace function public.create_multiplayer_game(
  p_category_id text,
  p_max_players integer default 4
)
returns table (
  game_code text,
  category_id text,
  status text,
  max_players integer,
  current_players integer,
  host_id uuid,
  duration_seconds integer,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_category private.quiz_categories;
  v_game public.multiplayer_games;
  v_now timestamptz := clock_timestamp();
begin
  v_user_id := private.assert_multiplayer_profile();

  if p_max_players is null or p_max_players < 2 or p_max_players > 4 then
    raise exception 'invalid_max_players' using errcode = '22023';
  end if;

  select *
  into v_category
  from private.quiz_categories as qc
  where qc.id = p_category_id
    and qc.is_active;

  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.multiplayer_players as mp
    join public.multiplayer_games as mg on mg.id = mp.game_id
    where mp.user_id = v_user_id
      and mp.left_at is null
      and mg.status in ('waiting', 'playing')
  ) then
    raise exception 'active_game_exists' using errcode = 'P0001';
  end if;

  for attempt in 1..20 loop
    begin
      insert into public.multiplayer_games (
        game_code,
        host_id,
        category_id,
        status,
        max_players,
        current_players,
        duration_seconds,
        expires_at,
        last_activity_at,
        created_at,
        updated_at
      )
      values (
        private.generate_multiplayer_game_code(),
        v_user_id,
        v_category.id,
        'waiting',
        p_max_players,
        1,
        v_category.duration_seconds,
        v_now + interval '30 minutes',
        v_now,
        v_now,
        v_now
      )
      returning * into v_game;
      exit;
    exception when unique_violation then
      if attempt = 20 then
        raise exception 'game_code_generation_failed' using errcode = 'P0001';
      end if;
    end;
  end loop;

  insert into public.multiplayer_players (
    game_id,
    user_id,
    is_ready,
    is_connected,
    joined_at,
    last_activity_at
  )
  values (
    v_game.id,
    v_user_id,
    true,
    true,
    v_now,
    v_now
  );

  game_code := v_game.game_code;
  category_id := v_game.category_id;
  status := v_game.status;
  max_players := v_game.max_players;
  current_players := v_game.current_players;
  host_id := v_game.host_id;
  duration_seconds := v_game.duration_seconds;
  expires_at := v_game.expires_at;
  created_at := v_game.created_at;
  return next;
end;
$$;

create or replace function public.join_multiplayer_game(p_game_code text)
returns table (
  result text,
  game_code text,
  status text,
  current_players integer,
  max_players integer,
  host_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code text;
  v_game public.multiplayer_games;
  v_existing public.multiplayer_players;
  v_now timestamptz := clock_timestamp();
begin
  v_user_id := private.assert_multiplayer_profile();
  v_code := upper(btrim(coalesce(p_game_code, '')));

  if v_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'invalid_game_code' using errcode = '22023';
  end if;

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.game_code = v_code
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if v_game.status = 'waiting' and v_game.last_activity_at < v_now - interval '30 minutes' then
    v_game := private.finish_multiplayer_game_locked(v_game.id, v_now, 'expired');
  elsif v_game.status = 'playing' and v_game.expires_at <= v_now then
    v_game := private.finish_multiplayer_game_locked(v_game.id, v_now, 'expired');
  end if;

  select *
  into v_existing
  from public.multiplayer_players as mp
  where mp.game_id = v_game.id
    and mp.user_id = v_user_id
  for update;

  if found then
    if v_game.status in ('finished', 'expired', 'cancelled') then
      raise exception 'game_expired' using errcode = 'P0001';
    end if;

    update public.multiplayer_players as mp
    set
      is_connected = true,
      disconnected_at = null,
      left_at = null,
      leave_reason = null,
      last_activity_at = v_now
    where mp.id = v_existing.id;

    result := 'already_joined';
  else
    if v_game.status in ('finished', 'expired', 'cancelled') then
      raise exception 'game_expired' using errcode = 'P0001';
    end if;

    if v_game.status = 'playing' then
      raise exception 'game_already_started' using errcode = 'P0001';
    end if;

    if v_game.current_players >= v_game.max_players then
      raise exception 'game_full' using errcode = 'P0001';
    end if;

    insert into public.multiplayer_players (
      game_id,
      user_id,
      is_ready,
      is_connected,
      joined_at,
      last_activity_at
    )
    values (
      v_game.id,
      v_user_id,
      false,
      true,
      v_now,
      v_now
    );

    update public.multiplayer_games as mg
    set
      current_players = mg.current_players + 1,
      last_activity_at = v_now,
      version = mg.version + 1
    where mg.id = v_game.id
    returning * into v_game;

    result := 'joined';
  end if;

  game_code := v_game.game_code;
  status := v_game.status;
  current_players := v_game.current_players;
  max_players := v_game.max_players;
  host_id := v_game.host_id;
  return next;
end;
$$;

create or replace function public.set_multiplayer_ready(
  p_game_code text,
  p_is_ready boolean
)
returns table (
  result text,
  game_code text,
  user_id uuid,
  is_ready boolean,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code text;
  v_game public.multiplayer_games;
  v_now timestamptz := clock_timestamp();
begin
  v_user_id := private.assert_multiplayer_profile();
  v_code := upper(btrim(coalesce(p_game_code, '')));

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.game_code = v_code
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if v_game.status <> 'waiting' then
    raise exception 'game_already_started' using errcode = 'P0001';
  end if;

  update public.multiplayer_players as mp
  set
    is_ready = coalesce(p_is_ready, false),
    is_connected = true,
    disconnected_at = null,
    last_activity_at = v_now
  where mp.game_id = v_game.id
    and mp.user_id = v_user_id
    and mp.left_at is null;

  if not found then
    raise exception 'not_a_player' using errcode = '42501';
  end if;

  update public.multiplayer_games as mg
  set last_activity_at = v_now, version = mg.version + 1
  where mg.id = v_game.id
  returning * into v_game;

  result := 'ready_updated';
  game_code := v_game.game_code;
  user_id := v_user_id;
  is_ready := coalesce(p_is_ready, false);
  status := v_game.status;
  return next;
end;
$$;

create or replace function public.start_multiplayer_game(p_game_code text)
returns table (
  result text,
  game_code text,
  category_id text,
  status text,
  started_at timestamptz,
  expires_at timestamptz,
  duration_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code text;
  v_game public.multiplayer_games;
  v_now timestamptz := clock_timestamp();
  v_connected_players integer;
  v_unready_players integer;
begin
  v_user_id := private.assert_multiplayer_profile();
  v_code := upper(btrim(coalesce(p_game_code, '')));

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.game_code = v_code
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if v_game.host_id <> v_user_id then
    raise exception 'host_required' using errcode = '42501';
  end if;

  if v_game.status <> 'waiting' then
    raise exception 'game_already_started' using errcode = 'P0001';
  end if;

  if v_game.last_activity_at < v_now - interval '30 minutes' then
    perform private.finish_multiplayer_game_locked(v_game.id, v_now, 'expired');
    raise exception 'game_expired' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_connected_players
  from public.multiplayer_players as mp
  where mp.game_id = v_game.id
    and mp.left_at is null
    and mp.is_connected;

  if v_connected_players < 2 then
    raise exception 'not_enough_players' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_unready_players
  from public.multiplayer_players as mp
  where mp.game_id = v_game.id
    and mp.left_at is null
    and mp.is_connected
    and not mp.is_ready;

  if v_unready_players > 0 then
    raise exception 'players_not_ready' using errcode = 'P0001';
  end if;

  update public.multiplayer_players as mp
  set score = 0, correct_answers = 0, finished_at = null, points_awarded = 0, global_credit_awarded_at = null
  where mp.game_id = v_game.id;

  update public.multiplayer_games as mg
  set
    status = 'playing',
    started_at = v_now,
    expires_at = v_now + make_interval(secs => mg.duration_seconds),
    last_activity_at = v_now,
    version = mg.version + 1
  where mg.id = v_game.id
  returning * into v_game;

  result := 'started';
  game_code := v_game.game_code;
  category_id := v_game.category_id;
  status := v_game.status;
  started_at := v_game.started_at;
  expires_at := v_game.expires_at;
  duration_seconds := v_game.duration_seconds;
  return next;
end;
$$;

create or replace function public.submit_multiplayer_answer(
  p_game_code text,
  p_answer text,
  p_client_submission_id uuid default null
)
returns table (
  result text,
  game_code text,
  correct_answers integer,
  points_current integer,
  expires_at timestamptz,
  status text,
  matched_answer_display text,
  matched_display_order integer,
  matched_answer_year text,
  matched_hint text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code text;
  v_game public.multiplayer_games;
  v_player public.multiplayer_players;
  v_normalized text;
  v_answer_id uuid;
  v_answer private.quiz_answers;
  v_now timestamptz := clock_timestamp();
  v_total_answers integer;
begin
  v_user_id := private.assert_multiplayer_profile();
  v_code := upper(btrim(coalesce(p_game_code, '')));

  if p_answer is null then
    raise exception 'invalid_answer' using errcode = '22023';
  end if;

  if char_length(p_answer) > 200 then
    raise exception 'answer_too_long' using errcode = '22023';
  end if;

  v_normalized := private.normalize_quiz_answer(p_answer);

  if char_length(v_normalized) = 0 then
    raise exception 'invalid_answer' using errcode = '22023';
  end if;

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.game_code = v_code
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  select *
  into v_player
  from public.multiplayer_players as mp
  where mp.game_id = v_game.id
    and mp.user_id = v_user_id
    and mp.left_at is null
  for update;

  if not found then
    raise exception 'not_a_player' using errcode = '42501';
  end if;

  if v_game.status <> 'playing' then
    result := case when v_game.status in ('finished', 'expired') then 'game_finished' else 'not_playing' end;
    game_code := v_game.game_code;
    correct_answers := v_player.correct_answers;
    points_current := v_player.score;
    expires_at := v_game.expires_at;
    status := v_game.status;
    return next;
    return;
  end if;

  if v_game.expires_at <= v_now then
    v_game := private.finish_multiplayer_game_locked(v_game.id, v_now, 'expired');
    result := 'expired';
    game_code := v_game.game_code;
    correct_answers := v_player.correct_answers;
    points_current := v_player.score;
    expires_at := v_game.expires_at;
    status := v_game.status;
    return next;
    return;
  end if;

  if p_client_submission_id is not null and exists (
    select 1 from public.multiplayer_answers as ma
    where ma.player_id = v_player.id
      and ma.client_submission_id = p_client_submission_id
  ) then
    result := 'duplicate';
    game_code := v_game.game_code;
    correct_answers := v_player.correct_answers;
    points_current := v_player.score;
    expires_at := v_game.expires_at;
    status := v_game.status;
    return next;
    return;
  end if;

  select count(*)::integer
  into v_total_answers
  from private.quiz_answers as qa
  where qa.category_id = v_game.category_id;

  v_answer_id := private.match_multiplayer_answer(v_game.category_id, v_game.id, v_player.id, v_normalized);

  if v_answer_id is null then
    select qa.*
    into v_answer
    from private.quiz_answers as qa
    join public.multiplayer_answers as ma on ma.answer_id = qa.id
    where ma.game_id = v_game.id
      and ma.player_id = v_player.id
      and qa.category_id = v_game.category_id
      and (
        qa.answer_normalized = v_normalized
        or (split_part(qa.answer_normalized, ' ', 1) = v_normalized and char_length(split_part(qa.answer_normalized, ' ', 1)) > 2)
        or (array_length(string_to_array(qa.answer_normalized, ' '), 1) > 1 and regexp_replace(qa.answer_normalized, '^.*\s', '') = v_normalized and char_length(regexp_replace(qa.answer_normalized, '^.*\s', '')) > 2)
      )
    order by qa.display_order
    limit 1;

    result := case when found then 'duplicate' else 'incorrect' end;
  else
    select *
    into v_answer
    from private.quiz_answers as qa
    where qa.id = v_answer_id;

    insert into public.multiplayer_answers (
      game_id,
      player_id,
      answer_id,
      submitted_normalized,
      answered_at,
      client_submission_id
    )
    values (
      v_game.id,
      v_player.id,
      v_answer_id,
      v_normalized,
      v_now,
      p_client_submission_id
    )
    on conflict do nothing;

    if found then
      update public.multiplayer_players as mp
      set
        correct_answers = mp.correct_answers + 1,
        score = mp.score + 10,
        last_activity_at = v_now,
        finished_at = case when mp.correct_answers + 1 >= v_total_answers then v_now else mp.finished_at end
      where mp.id = v_player.id
      returning * into v_player;

      result := 'correct';
    else
      result := 'duplicate';
    end if;
  end if;

  update public.multiplayer_games as mg
  set last_activity_at = v_now, version = mg.version + 1
  where mg.id = v_game.id
  returning * into v_game;

  game_code := v_game.game_code;
  correct_answers := v_player.correct_answers;
  points_current := v_player.score;
  expires_at := v_game.expires_at;
  status := v_game.status;
  if result in ('correct', 'duplicate') and v_answer.id is not null then
    matched_answer_display := v_answer.answer_text;
    matched_display_order := v_answer.display_order;
    matched_answer_year := v_answer.answer_year;
    matched_hint := v_answer.hint;
  end if;
  return next;
end;
$$;

create or replace function public.finish_multiplayer_game(p_game_code text)
returns table (
  result text,
  game_code text,
  status text,
  finished_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code text;
  v_game public.multiplayer_games;
  v_before text;
  v_now timestamptz := clock_timestamp();
begin
  v_user_id := private.assert_multiplayer_profile();
  v_code := upper(btrim(coalesce(p_game_code, '')));

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.game_code = v_code
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.multiplayer_players as mp
    where mp.game_id = v_game.id and mp.user_id = v_user_id and mp.left_at is null
  ) then
    raise exception 'not_a_player' using errcode = '42501';
  end if;

  v_before := v_game.status;
  v_game := private.finish_multiplayer_game_locked(v_game.id, v_now, case when v_game.expires_at <= v_now then 'expired' else 'finished' end);

  result := case when v_before in ('finished', 'expired', 'cancelled') then 'already_finished' else v_game.status end;
  game_code := v_game.game_code;
  status := v_game.status;
  finished_at := v_game.finished_at;
  return next;
end;
$$;

create or replace function public.leave_multiplayer_game(p_game_code text)
returns table (
  result text,
  game_code text,
  status text,
  current_players integer,
  host_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code text;
  v_game public.multiplayer_games;
  v_player public.multiplayer_players;
  v_now timestamptz := clock_timestamp();
begin
  v_user_id := private.assert_multiplayer_profile();
  v_code := upper(btrim(coalesce(p_game_code, '')));

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.game_code = v_code
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  select *
  into v_player
  from public.multiplayer_players as mp
  where mp.game_id = v_game.id
    and mp.user_id = v_user_id
    and mp.left_at is null
  for update;

  if not found then
    raise exception 'not_a_player' using errcode = '42501';
  end if;

  update public.multiplayer_players as mp
  set
    is_connected = false,
    disconnected_at = v_now,
    left_at = case when v_game.status = 'waiting' then v_now else mp.left_at end,
    leave_reason = case when v_game.status = 'waiting' then 'voluntary' else mp.leave_reason end,
    last_activity_at = v_now
  where mp.id = v_player.id;

  if v_game.status = 'waiting' then
    update public.multiplayer_games as mg
    set
      current_players = greatest(mg.current_players - 1, 0),
      last_activity_at = v_now,
      version = mg.version + 1
    where mg.id = v_game.id
    returning * into v_game;

    if v_game.host_id = v_user_id then
      perform private.transfer_multiplayer_host_locked(v_game.id, v_now);
      select * into v_game from public.multiplayer_games where id = v_game.id;
    end if;
  else
    update public.multiplayer_games as mg
    set last_activity_at = v_now, version = mg.version + 1
    where mg.id = v_game.id
    returning * into v_game;
  end if;

  result := 'left';
  game_code := v_game.game_code;
  status := v_game.status;
  current_players := v_game.current_players;
  host_id := v_game.host_id;
  return next;
end;
$$;

create or replace function public.disconnect_multiplayer_game(p_game_code text)
returns table (
  result text,
  game_code text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code text;
  v_game public.multiplayer_games;
  v_now timestamptz := clock_timestamp();
begin
  v_user_id := private.assert_multiplayer_profile();
  v_code := upper(btrim(coalesce(p_game_code, '')));

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.game_code = v_code
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  update public.multiplayer_players as mp
  set is_connected = false, disconnected_at = v_now, last_activity_at = v_now
  where mp.game_id = v_game.id
    and mp.user_id = v_user_id
    and mp.left_at is null;

  if not found then
    raise exception 'not_a_player' using errcode = '42501';
  end if;

  result := 'disconnected';
  game_code := v_game.game_code;
  status := v_game.status;
  return next;
end;
$$;

create or replace function public.reconnect_multiplayer_game(p_game_code text)
returns table (
  result text,
  game_code text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code text;
  v_game public.multiplayer_games;
  v_now timestamptz := clock_timestamp();
begin
  v_user_id := private.assert_multiplayer_profile();
  v_code := upper(btrim(coalesce(p_game_code, '')));

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.game_code = v_code
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if v_game.status in ('finished', 'expired', 'cancelled') then
    raise exception 'game_expired' using errcode = 'P0001';
  end if;

  update public.multiplayer_players as mp
  set is_connected = true, disconnected_at = null, last_activity_at = v_now
  where mp.game_id = v_game.id
    and mp.user_id = v_user_id
    and mp.left_at is null;

  if not found then
    raise exception 'not_a_player' using errcode = '42501';
  end if;

  result := 'reconnected';
  game_code := v_game.game_code;
  status := v_game.status;
  return next;
end;
$$;

create or replace function public.create_multiplayer_reaction(
  p_game_code text,
  p_reaction_type text
)
returns table (
  result text,
  game_code text,
  reaction_type text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code text;
  v_game public.multiplayer_games;
  v_now timestamptz := clock_timestamp();
  v_recent_count integer;
begin
  v_user_id := private.assert_multiplayer_profile();
  v_code := upper(btrim(coalesce(p_game_code, '')));

  if p_reaction_type not in ('like', 'heart', 'fire', 'party', 'shocked') then
    raise exception 'invalid_reaction_type' using errcode = '22023';
  end if;

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.game_code = v_code;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if v_game.status not in ('waiting', 'playing') then
    raise exception 'game_finished' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.multiplayer_players as mp
    where mp.game_id = v_game.id
      and mp.user_id = v_user_id
      and mp.left_at is null
  ) then
    raise exception 'not_a_player' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_recent_count
  from public.multiplayer_reactions as mr
  where mr.game_id = v_game.id
    and mr.user_id = v_user_id
    and mr.created_at > v_now - interval '10 seconds';

  if v_recent_count >= 5 then
    raise exception 'reaction_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.multiplayer_reactions (game_id, user_id, reaction_type, created_at)
  values (v_game.id, v_user_id, p_reaction_type, v_now);

  result := 'sent';
  game_code := v_game.game_code;
  reaction_type := p_reaction_type;
  created_at := v_now;
  return next;
end;
$$;

create or replace function public.get_my_multiplayer_game_state(p_game_code text)
returns table (
  game_code text,
  category_id text,
  status text,
  max_players integer,
  current_players integer,
  host_id uuid,
  duration_seconds integer,
  started_at timestamptz,
  expires_at timestamptz,
  finished_at timestamptz,
  player_id uuid,
  user_id uuid,
  pseudo varchar(20),
  score integer,
  correct_answers integer,
  is_ready boolean,
  is_connected boolean,
  is_host boolean,
  joined_at timestamptz,
  disconnected_at timestamptz,
  left_at timestamptz,
  rank integer,
  my_found_answer_display text,
  my_found_display_order integer,
  my_found_answer_year text,
  my_found_hint text,
  my_answered_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_code text;
  v_game public.multiplayer_games;
  v_player public.multiplayer_players;
begin
  v_user_id := private.assert_multiplayer_profile();
  v_code := upper(btrim(coalesce(p_game_code, '')));

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.game_code = v_code;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  select *
  into v_player
  from public.multiplayer_players as mp
  where mp.game_id = v_game.id
    and mp.user_id = v_user_id
    and mp.left_at is null;

  if not found then
    raise exception 'not_a_player' using errcode = '42501';
  end if;

  return query
  with ranked_players as (
    select
      mp.*,
      p.pseudo,
      row_number() over (
        order by mp.score desc, (
          select min(ma.answered_at)
          from public.multiplayer_answers as ma
          where ma.player_id = mp.id
        ) asc nulls last, mp.joined_at asc, mp.user_id asc
      )::integer as player_rank
    from public.multiplayer_players as mp
    join public.profiles as p on p.id = mp.user_id
    where mp.game_id = v_game.id
      and mp.left_at is null
  ),
  my_answers as (
    select
      qa.answer_text,
      qa.display_order,
      qa.answer_year,
      qa.hint,
      ma.answered_at
    from public.multiplayer_answers as ma
    join private.quiz_answers as qa on qa.id = ma.answer_id
    where ma.player_id = v_player.id
    order by qa.display_order
  )
  select
    v_game.game_code::text,
    v_game.category_id,
    v_game.status,
    v_game.max_players,
    v_game.current_players,
    v_game.host_id,
    v_game.duration_seconds,
    v_game.started_at,
    v_game.expires_at,
    v_game.finished_at,
    rp.id,
    rp.user_id,
    rp.pseudo,
    rp.score,
    rp.correct_answers,
    rp.is_ready,
    rp.is_connected,
    rp.user_id = v_game.host_id,
    rp.joined_at,
    rp.disconnected_at,
    rp.left_at,
    rp.player_rank,
    case when rp.id = v_player.id then ma.answer_text else null end,
    case when rp.id = v_player.id then ma.display_order else null end,
    case when rp.id = v_player.id then ma.answer_year else null end,
    case when rp.id = v_player.id then ma.hint else null end,
    case when rp.id = v_player.id then ma.answered_at else null end
  from ranked_players as rp
  left join my_answers as ma on rp.id = v_player.id
  order by rp.player_rank, ma.display_order nulls last;
end;
$$;

revoke all on function private.generate_multiplayer_game_code() from public;
revoke all on function private.match_multiplayer_answer(text, uuid, uuid, text) from public;
revoke all on function private.credit_multiplayer_player_locked(uuid, text, timestamptz) from public;
revoke all on function private.finish_multiplayer_game_locked(uuid, timestamptz, text) from public;
revoke all on function private.transfer_multiplayer_host_locked(uuid, timestamptz) from public;
revoke all on function private.expire_multiplayer_games(timestamptz) from public;
revoke all on function private.assert_multiplayer_profile() from public;

revoke all on function public.create_multiplayer_game(text, integer) from public;
revoke all on function public.join_multiplayer_game(text) from public;
revoke all on function public.set_multiplayer_ready(text, boolean) from public;
revoke all on function public.start_multiplayer_game(text) from public;
revoke all on function public.submit_multiplayer_answer(text, text, uuid) from public;
revoke all on function public.finish_multiplayer_game(text) from public;
revoke all on function public.leave_multiplayer_game(text) from public;
revoke all on function public.disconnect_multiplayer_game(text) from public;
revoke all on function public.reconnect_multiplayer_game(text) from public;
revoke all on function public.create_multiplayer_reaction(text, text) from public;
revoke all on function public.get_my_multiplayer_game_state(text) from public;

grant execute on function public.create_multiplayer_game(text, integer) to authenticated;
grant execute on function public.join_multiplayer_game(text) to authenticated;
grant execute on function public.set_multiplayer_ready(text, boolean) to authenticated;
grant execute on function public.start_multiplayer_game(text) to authenticated;
grant execute on function public.submit_multiplayer_answer(text, text, uuid) to authenticated;
grant execute on function public.finish_multiplayer_game(text) to authenticated;
grant execute on function public.leave_multiplayer_game(text) to authenticated;
grant execute on function public.disconnect_multiplayer_game(text) to authenticated;
grant execute on function public.reconnect_multiplayer_game(text) to authenticated;
grant execute on function public.create_multiplayer_reaction(text, text) to authenticated;
grant execute on function public.get_my_multiplayer_game_state(text) to authenticated;

comment on table public.multiplayer_games is
  'Parties multijoueur par code court, arbitrees cote serveur.';

comment on table public.multiplayer_players is
  'Participants, presence logique, score serveur et credit global idempotent.';

comment on table public.multiplayer_answers is
  'Bonnes reponses multijoueur par joueur, liees aux reponses canoniques privees.';

comment on table public.multiplayer_reactions is
  'Reactions multijoueur canoniques, limitees pour anti-spam.';
