-- Allow an authenticated player to release their own stale waiting rooms before creating a new one.

create or replace function public.leave_my_active_multiplayer_games()
returns table (
  result text,
  released_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_game record;
  v_remaining_players integer;
  v_new_host uuid;
  v_now timestamptz := clock_timestamp();
  v_count integer := 0;
begin
  v_user_id := private.assert_multiplayer_profile();

  perform private.expire_multiplayer_games(v_now);

  for v_game in
    select mg.*
    from public.multiplayer_games as mg
    join public.multiplayer_players as mp on mp.game_id = mg.id
    where mp.user_id = v_user_id
      and mp.left_at is null
      and mg.status in ('waiting', 'playing')
    order by mg.created_at, mg.id
    for update of mg
  loop
    update public.multiplayer_players as mp
    set
      is_connected = false,
      disconnected_at = v_now,
      left_at = v_now,
      leave_reason = 'voluntary',
      last_activity_at = v_now
    where mp.game_id = v_game.id
      and mp.user_id = v_user_id
      and mp.left_at is null;

    update public.multiplayer_games as mg
    set
      current_players = greatest(mg.current_players - 1, 0),
      last_activity_at = v_now,
      version = mg.version + 1
    where mg.id = v_game.id;

    select count(*)::integer
    into v_remaining_players
    from public.multiplayer_players as mp
    where mp.game_id = v_game.id
      and mp.left_at is null;

    if v_remaining_players = 0 then
      if v_game.status = 'playing' then
        perform private.finish_multiplayer_game_locked(v_game.id, v_now, 'finished');
      elsif v_game.host_id = v_user_id then
        perform private.transfer_multiplayer_host_locked(v_game.id, v_now);
      end if;
    elsif v_game.host_id = v_user_id then
      if v_game.status = 'waiting' then
        perform private.transfer_multiplayer_host_locked(v_game.id, v_now);
      else
        select mp.user_id
        into v_new_host
        from public.multiplayer_players as mp
        where mp.game_id = v_game.id
          and mp.left_at is null
        order by mp.is_connected desc, mp.joined_at, mp.id
        limit 1
        for update;

        update public.multiplayer_games as mg
        set host_id = v_new_host, last_activity_at = v_now, version = mg.version + 1
        where mg.id = v_game.id;
      end if;
    elsif v_game.status = 'playing' then
      update public.multiplayer_games as mg
      set current_players = v_remaining_players, last_activity_at = v_now, version = mg.version + 1
      where mg.id = v_game.id;
    else
      perform private.transfer_multiplayer_host_locked(v_game.id, v_now);
    end if;

    v_count := v_count + 1;
  end loop;

  result := 'released';
  released_count := v_count;
  return next;
end;
$$;

revoke all on function public.leave_my_active_multiplayer_games() from public;
grant execute on function public.leave_my_active_multiplayer_games() to authenticated;
