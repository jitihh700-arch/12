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
  points_current := v_session.correct_answers * 10;
  started_at := v_session.started_at;
  expires_at := v_session.expires_at;
  completed_at := v_session.completed_at;
  abandoned_at := v_session.abandoned_at;
  last_activity_at := v_session.last_activity_at;
  return next;
end;
$$;
