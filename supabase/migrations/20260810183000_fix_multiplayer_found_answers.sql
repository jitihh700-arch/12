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
  all_answers as (
    select
      mp.user_id as found_user_id,
      qa.answer_text,
      qa.display_order,
      qa.answer_year,
      qa.hint,
      ma.answered_at
    from public.multiplayer_answers as ma
    join private.quiz_answers as qa on qa.id = ma.answer_id
    join public.multiplayer_players as mp on mp.id = ma.player_id
    where ma.game_id = v_game.id
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
    aa.answer_text,
    aa.display_order,
    aa.answer_year,
    aa.hint,
    aa.answered_at
  from ranked_players as rp
  left join all_answers as aa on aa.found_user_id = rp.user_id
  order by rp.player_rank, aa.display_order nulls last;
end;
$$;
