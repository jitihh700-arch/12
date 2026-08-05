-- Evite un interblocage entre la verification du profil et le credit final.

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

  v_user_id := private.assert_multiplayer_profile();

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

revoke all on function public.finish_multiplayer_game(text) from public;
grant execute on function public.finish_multiplayer_game(text) to authenticated;
