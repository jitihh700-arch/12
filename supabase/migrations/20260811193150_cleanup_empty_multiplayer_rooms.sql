-- Supprime une salle multijoueur quand le dernier joueur la quitte volontairement.
-- Un disconnect reste temporaire ; seul leave_multiplayer_game marque le depart reel.

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
  v_new_host uuid;
  v_remaining_players integer;
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
    left_at = v_now,
    leave_reason = 'voluntary',
    last_activity_at = v_now
  where mp.id = v_player.id;

  select count(*)::integer
  into v_remaining_players
  from public.multiplayer_players as mp
  where mp.game_id = v_game.id
    and mp.left_at is null;

  game_code := v_game.game_code;

  if v_remaining_players = 0 then
    delete from public.multiplayer_games as mg
    where mg.id = v_game.id;

    result := 'deleted';
    status := 'cancelled';
    current_players := 0;
    host_id := null;
    return next;
    return;
  end if;

  if v_game.host_id = v_user_id then
    select mp.user_id
    into v_new_host
    from public.multiplayer_players as mp
    where mp.game_id = v_game.id
      and mp.left_at is null
    order by mp.is_connected desc, mp.joined_at, mp.id
    limit 1
    for update;
  else
    v_new_host := v_game.host_id;
  end if;

  update public.multiplayer_games as mg
  set
    current_players = v_remaining_players,
    host_id = v_new_host,
    last_activity_at = v_now,
    version = mg.version + 1
  where mg.id = v_game.id
  returning * into v_game;

  result := 'left';
  status := v_game.status;
  current_players := v_game.current_players;
  host_id := v_game.host_id;
  return next;
end;
$$;

revoke all on function public.leave_multiplayer_game(text) from public;
grant execute on function public.leave_multiplayer_game(text) to authenticated;
