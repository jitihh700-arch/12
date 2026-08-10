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
    v_session := private.finish_quiz_session_locked(v_session.id, v_now);
    result := 'expired';
    correct_answers := v_session.correct_answers;
    points_current := v_session.correct_answers * 10;
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
          or (array_length(string_to_array(qa.answer_normalized, ' '), 1) > 1 and regexp_replace(qa.answer_normalized, '^.*\\s', '') = v_normalized and char_length(regexp_replace(qa.answer_normalized, '^.*\\s', '')) > 2)
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
  points_current := v_session.correct_answers * 10;
  remaining_answers_count := greatest(v_total_answers - v_session.correct_answers, 0);
  expires_at := v_session.expires_at;
  status := v_session.status;
  return next;
end;
$$;
