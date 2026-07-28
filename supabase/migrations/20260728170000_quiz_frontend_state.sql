-- Phase 4B: etat restaurable du quiz et retour controle des reponses trouvees.

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
  v_grace interval := interval '5 seconds';
begin
  select *
  into v_session
  from public.quiz_sessions as qs
  where qs.id = p_session_id
  for update;

  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;

  if v_session.status in ('completed', 'expired', 'abandoned') then
    return v_session;
  end if;

  if v_session.expires_at < p_now - v_grace then
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

drop function public.submit_quiz_answer(uuid, text);

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
  v_session public.quiz_sessions;
  v_normalized text;
  v_answer_id uuid;
  v_answer private.quiz_answers;
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
    select qa.*
    into v_answer
    from private.quiz_answers as qa
    join public.quiz_session_answers as qsa on qsa.answer_id = qa.id
    where qsa.session_id = v_session.id
      and qa.category_id = v_session.category_id
      and (
        qa.answer_normalized = v_normalized
        or (split_part(qa.answer_normalized, ' ', 1) = v_normalized and char_length(split_part(qa.answer_normalized, ' ', 1)) > 2)
        or (array_length(string_to_array(qa.answer_normalized, ' '), 1) > 1 and regexp_replace(qa.answer_normalized, '^.*\s', '') = v_normalized and char_length(regexp_replace(qa.answer_normalized, '^.*\s', '')) > 2)
      )
    order by qa.display_order
    limit 1;

    result := case when found then 'duplicate' else 'incorrect' end;

    update public.quiz_sessions as qs
    set last_activity_at = v_now
    where qs.id = v_session.id
    returning * into v_session;

    correct_answers := v_session.correct_answers;
    points_current := v_session.correct_answers * 10;
    remaining_answers_count := v_total_answers - v_session.correct_answers;
    expires_at := v_session.expires_at;
    status := v_session.status;
    if result = 'duplicate' then
      matched_answer_display := v_answer.answer_text;
      matched_display_order := v_answer.display_order;
      matched_answer_year := v_answer.answer_year;
      matched_hint := v_answer.hint;
    end if;
    return next;
    return;
  end if;

  select *
  into v_answer
  from private.quiz_answers as qa
  where qa.id = v_answer_id;

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
  matched_answer_display := v_answer.answer_text;
  matched_display_order := v_answer.display_order;
  matched_answer_year := v_answer.answer_year;
  matched_hint := v_answer.hint;
  return next;
end;
$$;

create or replace function public.get_my_quiz_session_state(p_session_id uuid)
returns table (
  session_id uuid,
  category_id text,
  status text,
  correct_answers integer,
  points_current integer,
  duration_seconds integer,
  started_at timestamptz,
  expires_at timestamptz,
  completed_at timestamptz,
  abandoned_at timestamptz,
  last_activity_at timestamptz,
  found_answer_display text,
  found_display_order integer,
  found_answer_year text,
  found_hint text,
  answered_at timestamptz
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

  return query
  select
    v_session.id,
    v_session.category_id,
    v_session.status,
    v_session.correct_answers,
    case when v_session.status = 'expired' then 0 else v_session.correct_answers * 10 end,
    v_session.duration_seconds,
    v_session.started_at,
    v_session.expires_at,
    v_session.completed_at,
    v_session.abandoned_at,
    v_session.last_activity_at,
    qa.answer_text,
    qa.display_order,
    qa.answer_year,
    qa.hint,
    qsa.answered_at
  from (select 1) as anchor
  left join public.quiz_session_answers as qsa on qsa.session_id = v_session.id
  left join private.quiz_answers as qa on qa.id = qsa.answer_id
  order by qa.display_order nulls last;
end;
$$;

revoke all on function public.submit_quiz_answer(uuid, text) from public;
revoke all on function public.get_my_quiz_session_state(uuid) from public;
grant execute on function public.submit_quiz_answer(uuid, text) to authenticated;
grant execute on function public.get_my_quiz_session_state(uuid) to authenticated;
