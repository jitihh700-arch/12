-- Serialise la finalisation d'une meme partie avant les verrous de lignes.

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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('multiplayer_finish:' || p_game_id::text, 0)
  );

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
  v_game_id uuid;
  v_game public.multiplayer_games;
  v_before text;
  v_now timestamptz := clock_timestamp();
begin
  v_user_id := private.assert_multiplayer_profile();
  v_code := upper(btrim(coalesce(p_game_code, '')));

  select mg.id
  into v_game_id
  from public.multiplayer_games as mg
  where mg.game_code = v_code;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('multiplayer_finish:' || v_game_id::text, 0)
  );

  select *
  into v_game
  from public.multiplayer_games as mg
  where mg.id = v_game_id
  for update;

  if not found then
    raise exception 'game_not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.multiplayer_players as mp
    where mp.game_id = v_game.id
      and mp.user_id = v_user_id
      and mp.left_at is null
  ) then
    raise exception 'not_a_player' using errcode = '42501';
  end if;

  v_before := v_game.status;
  v_game := private.finish_multiplayer_game_locked(
    v_game.id,
    v_now,
    case when v_game.expires_at <= v_now then 'expired' else 'finished' end
  );

  result := case when v_before in ('finished', 'expired', 'cancelled') then 'already_finished' else v_game.status end;
  game_code := v_game.game_code;
  status := v_game.status;
  finished_at := v_game.finished_at;
  return next;
end;
$$;

revoke all on function private.finish_multiplayer_game_locked(uuid, timestamptz, text) from public;
revoke all on function public.finish_multiplayer_game(text) from public;

grant execute on function public.finish_multiplayer_game(text) to authenticated;
