-- Reponses multijoueur prises une seule fois par salle.
-- Une reponse trouvee reste visible pour tous, mais seul le premier joueur marque.

alter table public.multiplayer_answers
drop constraint if exists multiplayer_answers_unique_player_answer;

alter table public.multiplayer_answers
drop constraint if exists multiplayer_answers_unique_answer;

with duplicated_answers as (
  select
    ma.id,
    ma.player_id,
    row_number() over (
      partition by ma.game_id, ma.answer_id
      order by ma.answered_at asc, ma.id asc
    ) as claim_rank
  from public.multiplayer_answers as ma
),
duplicate_counts as (
  select player_id, count(*)::integer as removed_count
  from duplicated_answers
  where claim_rank > 1
  group by player_id
),
adjusted_players as (
  update public.multiplayer_players as mp
  set
    correct_answers = greatest(0, mp.correct_answers - dc.removed_count),
    score = greatest(0, mp.score - (dc.removed_count * 10))
  from duplicate_counts as dc
  where dc.player_id = mp.id
  returning mp.id
)
delete from public.multiplayer_answers as ma
using duplicated_answers as da
where ma.id = da.id
  and da.claim_rank > 1;

alter table public.multiplayer_answers
add constraint multiplayer_answers_unique_answer
unique (game_id, answer_id);

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
  v_answer private.quiz_answers;
  v_existing public.multiplayer_answers;
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
    select 1
    from public.multiplayer_answers as ma
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

  select *
  into v_answer
  from private.quiz_answers as qa
  where qa.category_id = v_game.category_id
    and (
      qa.answer_normalized = v_normalized
      or (
        split_part(qa.answer_normalized, ' ', 1) = v_normalized
        and char_length(split_part(qa.answer_normalized, ' ', 1)) > 2
      )
      or (
        array_length(string_to_array(qa.answer_normalized, ' '), 1) > 1
        and regexp_replace(qa.answer_normalized, '^.*\s', '') = v_normalized
        and char_length(regexp_replace(qa.answer_normalized, '^.*\s', '')) > 2
      )
    )
  order by qa.display_order
  limit 1;

  if not found then
    result := 'incorrect';
  else
    select *
    into v_existing
    from public.multiplayer_answers as ma
    where ma.game_id = v_game.id
      and ma.answer_id = v_answer.id
    for update;

    if found then
      result := case
        when v_existing.player_id = v_player.id then 'duplicate'
        else 'already_found_by_other'
      end;
    else
      begin
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
          v_answer.id,
          v_normalized,
          v_now,
          p_client_submission_id
        );
      exception
        when unique_violation then
          select *
          into v_existing
          from public.multiplayer_answers as ma
          where ma.game_id = v_game.id
            and ma.answer_id = v_answer.id
          for update;

          result := case
            when v_existing.player_id = v_player.id then 'duplicate'
            else 'already_found_by_other'
          end;
      end;

      if result is not null then
        game_code := v_game.game_code;
        correct_answers := v_player.correct_answers;
        points_current := v_player.score;
        expires_at := v_game.expires_at;
        status := v_game.status;
        matched_answer_display := v_answer.answer_text;
        matched_display_order := v_answer.display_order;
        matched_answer_year := v_answer.answer_year;
        matched_hint := v_answer.hint;
        return next;
        return;
      end if;

      select count(*)::integer
      into v_total_answers
      from private.quiz_answers as qa
      where qa.category_id = v_game.category_id;

      update public.multiplayer_players as mp
      set
        correct_answers = mp.correct_answers + 1,
        score = mp.score + 10,
        last_activity_at = v_now,
        finished_at = case when mp.correct_answers + 1 >= v_total_answers then v_now else mp.finished_at end
      where mp.id = v_player.id
      returning * into v_player;

      result := 'correct';
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
  if result in ('correct', 'duplicate', 'already_found_by_other') and v_answer.id is not null then
    matched_answer_display := v_answer.answer_text;
    matched_display_order := v_answer.display_order;
    matched_answer_year := v_answer.answer_year;
    matched_hint := v_answer.hint;
  end if;
  return next;
end;
$$;

drop function if exists public.get_my_multiplayer_game_state(text);

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
  my_answered_at timestamptz,
  all_found_answers jsonb
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
  ),
  all_answers as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'display', qa.answer_text,
          'displayOrder', qa.display_order,
          'answerYear', qa.answer_year,
          'hint', qa.hint
        )
        order by qa.display_order
      ),
      '[]'::jsonb
    ) as payload
    from public.multiplayer_answers as ma
    join private.quiz_answers as qa on qa.id = ma.answer_id
    where ma.game_id = v_game.id
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
    case when rp.id = v_player.id then ma.answered_at else null end,
    aa.payload
  from ranked_players as rp
  cross join all_answers as aa
  left join my_answers as ma on rp.id = v_player.id
  order by rp.player_rank, ma.display_order nulls last;
end;
$$;

revoke all on function public.submit_multiplayer_answer(text, text, uuid) from public;
revoke all on function public.get_my_multiplayer_game_state(text) from public;
grant execute on function public.submit_multiplayer_answer(text, text, uuid) to authenticated;
grant execute on function public.get_my_multiplayer_game_state(text) to authenticated;
