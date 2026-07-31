-- Cycle de vie des salles multijoueur apres deconnexion ou depart explicite.

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
    current_players = case when p_status in ('finished', 'expired', 'cancelled') then 0 else mg.current_players end,
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
      order by joined_at, id
      for update
    loop
      perform private.credit_multiplayer_player_locked(v_player.id, v_game.category_id, p_now);
    end loop;
  end if;

  return v_game;
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
  v_active_count integer;
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
    left_at = v_now,
    leave_reason = 'voluntary',
    last_activity_at = v_now
  where mp.id = v_player.id
  returning * into v_player;

  select count(*)::integer
  into v_active_count
  from public.multiplayer_players as mp
  where mp.game_id = v_game.id
    and mp.left_at is null;

  if v_game.status = 'waiting' then
    if v_active_count = 0 then
      update public.multiplayer_games as mg
      set
        status = 'cancelled',
        current_players = 0,
        finished_at = v_now,
        last_activity_at = v_now,
        version = mg.version + 1
      where mg.id = v_game.id
      returning * into v_game;
    else
      update public.multiplayer_games as mg
      set
        current_players = v_active_count,
        last_activity_at = v_now,
        version = mg.version + 1
      where mg.id = v_game.id
      returning * into v_game;

      if v_game.host_id = v_user_id then
        perform private.transfer_multiplayer_host_locked(v_game.id, v_now);
        select * into v_game from public.multiplayer_games where id = v_game.id;
      end if;
    end if;
  elsif v_game.status = 'playing' then
    perform private.credit_multiplayer_player_locked(v_player.id, v_game.category_id, v_now);

    if v_active_count = 0 then
      v_game := private.finish_multiplayer_game_locked(v_game.id, v_now, 'finished');
    else
      update public.multiplayer_games as mg
      set
        current_players = v_active_count,
        last_activity_at = v_now,
        version = mg.version + 1
      where mg.id = v_game.id
      returning * into v_game;

      if v_game.host_id = v_user_id then
        perform private.transfer_multiplayer_host_locked(v_game.id, v_now);
        select * into v_game from public.multiplayer_games where id = v_game.id;
      end if;
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

  update public.multiplayer_games as mg
  set last_activity_at = v_now, version = mg.version + 1
  where mg.id = v_game.id
  returning * into v_game;

  result := 'disconnected';
  game_code := v_game.game_code;
  status := v_game.status;
  return next;
end;
$$;

revoke all on function private.finish_multiplayer_game_locked(uuid, timestamptz, text) from public;
revoke all on function public.leave_multiplayer_game(text) from public;
revoke all on function public.disconnect_multiplayer_game(text) from public;

grant execute on function public.leave_multiplayer_game(text) to authenticated;
grant execute on function public.disconnect_multiplayer_game(text) to authenticated;
