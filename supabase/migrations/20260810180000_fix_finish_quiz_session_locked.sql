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

  v_points := v_session.correct_answers * 10;

  if v_session.expires_at <= p_now then
    update public.quiz_sessions as qs
    set
      status = 'expired',
      points_awarded = v_points,
      last_activity_at = p_now
    where qs.id = p_session_id
    returning * into v_session;

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
      quizzes_completed = public.user_category_stats.quizzes_completed + excluded.quizzes_completed,
      last_played_at = excluded.last_played_at;

    return v_session;
  end if;

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
      quizzes_completed = public.user_category_stats.quizzes_completed + excluded.quizzes_completed,
      last_played_at = excluded.last_played_at;
  end if;

  return v_session;
end;
$$;
