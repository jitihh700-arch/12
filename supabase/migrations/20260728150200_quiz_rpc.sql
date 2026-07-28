-- Phase 4A: RPC de sessions, validation serveur et leaderboard.
-- Les fonctions clientes ne prennent jamais user_id ni points.

create or replace function private.match_quiz_answer(
  p_category_id text,
  p_session_id uuid,
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
      from public.quiz_session_answers as qsa
      where qsa.session_id = p_session_id
        and qsa.answer_id = qa.id
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

create or replace function private.finish_quiz_session_locked(
  p_session_id uuid,
  p_now timestamptz
)
returns public.quiz_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.quiz_sessions;
  v_points integer;
begin
  select *
  into v_session
  from public.quiz_sessions as qs
  where qs.id = p_session_id
  for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.status = 'completed' then
    return v_session;
  end if;

  if v_session.status in ('expired', 'abandoned') then
    return v_session;
  end if;

  if v_session.expires_at <= p_now then
    update public.quiz_sessions as qs
    set
      status = 'expired',
      points_awarded = 0,
      last_activity_at = p_now
    where qs.id = p_session_id
    returning * into v_session;

    return v_session;
  end if;

  v_points := v_session.correct_answers * 10;

  update public.quiz_sessions as qs
  set
    status = 'completed',
    points_awarded = v_points,
    completed_at = p_now,
    last_activity_at = p_now
  where qs.id = p_session_id
    and qs.status = 'active'
  returning * into v_session;

  if found then
    update public.profiles as p
    set
      total_points = p.total_points + v_points,
      quizzes_completed = p.quizzes_completed + 1,
      last_played_at = p_now
    where p.id = v_session.user_id;

    insert into public.user_category_stats (
      user_id,
      category_id,
      total_points,
      correct_answers,
      quizzes_completed,
      last_played_at
    )
    values (
      v_session.user_id,
      v_session.category_id,
      v_points,
      v_session.correct_answers,
      1,
      p_now
    )
    on conflict (user_id, category_id) do update
    set
      total_points = public.user_category_stats.total_points + excluded.total_points,
      correct_answers = public.user_category_stats.correct_answers + excluded.correct_answers,
      quizzes_completed = public.user_category_stats.quizzes_completed + 1,
      last_played_at = excluded.last_played_at;
  end if;

  return v_session;
end;
$$;

create or replace function public.start_quiz_session(p_category_id text)
returns table (
  session_id uuid,
  category_id text,
  duration_seconds integer,
  started_at timestamptz,
  expires_at timestamptz,
  status text,
  correct_answers integer,
  points_current integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_category private.quiz_categories;
  v_session public.quiz_sessions;
  v_now timestamptz;
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

  select *
  into v_category
  from private.quiz_categories as qc
  where qc.id = p_category_id;

  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  if not v_category.is_active then
    raise exception 'category_inactive' using errcode = 'P0001';
  end if;

  v_now := clock_timestamp();

  update public.quiz_sessions as qs
  set
    status = 'expired',
    points_awarded = 0,
    last_activity_at = v_now
  where qs.user_id = v_user_id
    and qs.status = 'active'
    and qs.expires_at <= v_now;

  update public.quiz_sessions as qs
  set
    status = 'abandoned',
    abandoned_at = v_now,
    points_awarded = 0,
    last_activity_at = v_now
  where qs.user_id = v_user_id
    and qs.status = 'active';

  insert into public.quiz_sessions (
    user_id,
    category_id,
    status,
    duration_seconds,
    started_at,
    expires_at,
    last_activity_at
  )
  values (
    v_user_id,
    v_category.id,
    'active',
    v_category.duration_seconds,
    v_now,
    v_now + make_interval(secs => v_category.duration_seconds),
    v_now
  )
  returning * into v_session;

  session_id := v_session.id;
  category_id := v_session.category_id;
  duration_seconds := v_session.duration_seconds;
  started_at := v_session.started_at;
  expires_at := v_session.expires_at;
  status := v_session.status;
  correct_answers := v_session.correct_answers;
  points_current := v_session.correct_answers * 10;
  return next;
end;
$$;

create or replace function public.submit_quiz_answer(
  p_session_id uuid,
  p_answer text
)
returns table (
  result text,
  correct_answers integer,
  points_current integer,
  remaining_answers_count integer,
  expires_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_session public.quiz_sessions;
  v_normalized text;
  v_answer_id uuid;
  v_total_answers integer;
  v_remaining integer;
  v_now timestamptz;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

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

  v_now := clock_timestamp();

  select *
  into v_session
  from public.quiz_sessions as qs
  where qs.id = p_session_id
  for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.user_id <> v_user_id then
    raise exception 'session_forbidden' using errcode = '42501';
  end if;

  if v_session.status <> 'active' then
    raise exception 'session_not_active' using errcode = 'P0001';
  end if;

  if v_session.expires_at <= v_now then
    update public.quiz_sessions as qs
    set
      status = 'expired',
      points_awarded = 0,
      last_activity_at = v_now
    where qs.id = p_session_id
    returning * into v_session;

    result := 'expired';
    correct_answers := v_session.correct_answers;
    points_current := 0;
    remaining_answers_count := null;
    expires_at := v_session.expires_at;
    status := v_session.status;
    return next;
    return;
  end if;

  select count(*)::integer
  into v_total_answers
  from private.quiz_answers as qa
  where qa.category_id = v_session.category_id;

  v_answer_id := private.match_quiz_answer(v_session.category_id, v_session.id, v_normalized);

  if v_answer_id is null then
    if exists (
      select 1
      from private.quiz_answers as qa
      join public.quiz_session_answers as qsa on qsa.answer_id = qa.id
      where qsa.session_id = v_session.id
        and qa.category_id = v_session.category_id
        and (
          qa.answer_normalized = v_normalized
          or (split_part(qa.answer_normalized, ' ', 1) = v_normalized and char_length(split_part(qa.answer_normalized, ' ', 1)) > 2)
          or (array_length(string_to_array(qa.answer_normalized, ' '), 1) > 1 and regexp_replace(qa.answer_normalized, '^.*\s', '') = v_normalized and char_length(regexp_replace(qa.answer_normalized, '^.*\s', '')) > 2)
        )
    ) then
      result := 'duplicate';
    else
      result := 'incorrect';
    end if;

    update public.quiz_sessions as qs
    set last_activity_at = v_now
    where qs.id = v_session.id
    returning * into v_session;

    correct_answers := v_session.correct_answers;
    points_current := v_session.correct_answers * 10;
    remaining_answers_count := v_total_answers - v_session.correct_answers;
    expires_at := v_session.expires_at;
    status := v_session.status;
    return next;
    return;
  end if;

  insert into public.quiz_session_answers (
    session_id,
    answer_id,
    submitted_normalized,
    answered_at
  )
  values (
    v_session.id,
    v_answer_id,
    v_normalized,
    v_now
  )
  on conflict (session_id, answer_id) do nothing;

  if not found then
    result := 'duplicate';
  else
    update public.quiz_sessions as qs
    set
      correct_answers = qs.correct_answers + 1,
      last_activity_at = v_now
    where qs.id = v_session.id
    returning * into v_session;

    result := 'correct';
  end if;

  v_remaining := v_total_answers - v_session.correct_answers;

  if v_remaining = 0 and v_session.status = 'active' then
    v_session := private.finish_quiz_session_locked(v_session.id, v_now);
    result := 'completed';
  end if;

  correct_answers := v_session.correct_answers;
  points_current := case when v_session.status = 'expired' then 0 else v_session.correct_answers * 10 end;
  remaining_answers_count := greatest(v_total_answers - v_session.correct_answers, 0);
  expires_at := v_session.expires_at;
  status := v_session.status;
  return next;
end;
$$;

create or replace function public.complete_quiz_session(p_session_id uuid)
returns table (
  result text,
  correct_answers integer,
  points_awarded integer,
  status text,
  completed_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_session public.quiz_sessions;
  v_before_status text;
  v_now timestamptz;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select *
  into v_session
  from public.quiz_sessions as qs
  where qs.id = p_session_id
  for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.user_id <> v_user_id then
    raise exception 'session_forbidden' using errcode = '42501';
  end if;

  v_before_status := v_session.status;
  v_now := clock_timestamp();
  v_session := private.finish_quiz_session_locked(p_session_id, v_now);

  if v_session.status = 'completed' then
    result := case when v_before_status = 'completed' then 'already_completed' else 'completed' end;
  elsif v_session.status = 'expired' then
    result := 'expired';
  elsif v_session.status = 'abandoned' then
    result := 'abandoned';
  else
    result := v_session.status;
  end if;

  correct_answers := v_session.correct_answers;
  points_awarded := v_session.points_awarded;
  status := v_session.status;
  completed_at := v_session.completed_at;
  expires_at := v_session.expires_at;
  return next;
end;
$$;

create or replace function public.abandon_quiz_session(p_session_id uuid)
returns table (
  result text,
  correct_answers integer,
  points_awarded integer,
  status text,
  abandoned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_session public.quiz_sessions;
  v_now timestamptz;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select *
  into v_session
  from public.quiz_sessions as qs
  where qs.id = p_session_id
  for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.user_id <> v_user_id then
    raise exception 'session_forbidden' using errcode = '42501';
  end if;

  if v_session.status = 'abandoned' then
    result := 'already_abandoned';
  elsif v_session.status <> 'active' then
    result := v_session.status;
  else
    v_now := clock_timestamp();
    update public.quiz_sessions as qs
    set
      status = 'abandoned',
      abandoned_at = v_now,
      points_awarded = 0,
      last_activity_at = v_now
    where qs.id = p_session_id
    returning * into v_session;
    result := 'abandoned';
  end if;

  correct_answers := v_session.correct_answers;
  points_awarded := v_session.points_awarded;
  status := v_session.status;
  abandoned_at := v_session.abandoned_at;
  return next;
end;
$$;

create or replace function public.get_my_quiz_session(p_session_id uuid)
returns table (
  session_id uuid,
  category_id text,
  status text,
  duration_seconds integer,
  correct_answers integer,
  points_current integer,
  started_at timestamptz,
  expires_at timestamptz,
  completed_at timestamptz,
  abandoned_at timestamptz,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_session public.quiz_sessions;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select *
  into v_session
  from public.quiz_sessions as qs
  where qs.id = p_session_id;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.user_id <> v_user_id then
    raise exception 'session_forbidden' using errcode = '42501';
  end if;

  session_id := v_session.id;
  category_id := v_session.category_id;
  status := v_session.status;
  duration_seconds := v_session.duration_seconds;
  correct_answers := v_session.correct_answers;
  points_current := case when v_session.status = 'expired' then 0 else v_session.correct_answers * 10 end;
  started_at := v_session.started_at;
  expires_at := v_session.expires_at;
  completed_at := v_session.completed_at;
  abandoned_at := v_session.abandoned_at;
  last_activity_at := v_session.last_activity_at;
  return next;
end;
$$;

create or replace function public.get_leaderboard(p_limit integer default 20)
returns table (
  rank integer,
  pseudo varchar(20),
  total_points integer,
  quizzes_completed integer,
  last_played_at timestamptz
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

  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception 'invalid_leaderboard_limit' using errcode = '22023';
  end if;

  v_limit := p_limit;

  return query
  select
    ranked.player_rank::integer,
    ranked.pseudo,
    ranked.total_points,
    ranked.quizzes_completed,
    ranked.last_played_at
  from (
    select
      row_number() over (
        order by p.total_points desc, p.last_played_at desc nulls last, p.created_at asc, p.id asc
      ) as player_rank,
      p.pseudo,
      p.total_points,
      p.quizzes_completed,
      p.last_played_at
    from public.profiles as p
  ) as ranked
  order by ranked.player_rank
  limit v_limit;
end;
$$;

create or replace function public.get_my_leaderboard_rank()
returns table (
  rank integer,
  pseudo varchar(20),
  total_points integer,
  quizzes_completed integer,
  last_played_at timestamptz,
  total_players integer
)
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

  return query
  select
    ranked.player_rank::integer,
    ranked.pseudo,
    ranked.total_points,
    ranked.quizzes_completed,
    ranked.last_played_at,
    ranked.total_players::integer
  from (
    select
      p.id,
      row_number() over (
        order by p.total_points desc, p.last_played_at desc nulls last, p.created_at asc, p.id asc
      ) as player_rank,
      count(*) over () as total_players,
      p.pseudo,
      p.total_points,
      p.quizzes_completed,
      p.last_played_at
    from public.profiles as p
  ) as ranked
  where ranked.id = v_user_id;

  if not found then
    raise exception 'profile_required' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function private.match_quiz_answer(text, uuid, text) from public;
revoke all on function private.finish_quiz_session_locked(uuid, timestamptz) from public;

revoke all on function public.start_quiz_session(text) from public;
revoke all on function public.submit_quiz_answer(uuid, text) from public;
revoke all on function public.complete_quiz_session(uuid) from public;
revoke all on function public.abandon_quiz_session(uuid) from public;
revoke all on function public.get_my_quiz_session(uuid) from public;
revoke all on function public.get_leaderboard(integer) from public;
revoke all on function public.get_my_leaderboard_rank() from public;

grant execute on function public.start_quiz_session(text) to authenticated;
grant execute on function public.submit_quiz_answer(uuid, text) to authenticated;
grant execute on function public.complete_quiz_session(uuid) to authenticated;
grant execute on function public.abandon_quiz_session(uuid) to authenticated;
grant execute on function public.get_my_quiz_session(uuid) to authenticated;
grant execute on function public.get_leaderboard(integer) to authenticated;
grant execute on function public.get_my_leaderboard_rank() to authenticated;
