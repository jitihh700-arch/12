-- Supprime la confirmation "pret" du lancement multijoueur.
-- L'hote peut demarrer des que deux joueurs sont connectes.

create or replace function public.start_multiplayer_game(p_game_code text)
returns table (
  result text,
  game_code text,
  category_id text,
  status text,
  started_at timestamptz,
  expires_at timestamptz,
  duration_seconds integer
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
  v_connected_players integer;
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

  if v_game.host_id <> v_user_id then
    raise exception 'host_required' using errcode = '42501';
  end if;

  if v_game.status <> 'waiting' then
    raise exception 'game_already_started' using errcode = 'P0001';
  end if;

  if v_game.last_activity_at < v_now - interval '30 minutes' then
    perform private.finish_multiplayer_game_locked(v_game.id, v_now, 'expired');
    raise exception 'game_expired' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_connected_players
  from public.multiplayer_players as mp
  where mp.game_id = v_game.id
    and mp.left_at is null
    and mp.is_connected;

  if v_connected_players < 2 then
    raise exception 'not_enough_players' using errcode = 'P0001';
  end if;

  update public.multiplayer_players as mp
  set
    score = 0,
    correct_answers = 0,
    finished_at = null,
    points_awarded = 0,
    global_credit_awarded_at = null
  where mp.game_id = v_game.id;

  update public.multiplayer_games as mg
  set
    status = 'playing',
    started_at = v_now,
    expires_at = v_now + make_interval(secs => mg.duration_seconds),
    last_activity_at = v_now,
    version = mg.version + 1
  where mg.id = v_game.id
  returning * into v_game;

  result := 'started';
  game_code := v_game.game_code;
  category_id := v_game.category_id;
  status := v_game.status;
  started_at := v_game.started_at;
  expires_at := v_game.expires_at;
  duration_seconds := v_game.duration_seconds;
  return next;
end;
$$;

revoke all on function public.start_multiplayer_game(text) from public;
grant execute on function public.start_multiplayer_game(text) to authenticated;
