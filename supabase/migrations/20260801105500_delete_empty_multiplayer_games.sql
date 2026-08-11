-- Remove multiplayer rooms when no active participant remains.

create or replace function private.expire_multiplayer_games(p_now timestamptz default clock_timestamp())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game record;
  v_count integer := 0;
  v_connected_players integer;
  v_timed_out_players integer;
begin
  for v_game in
    select *
    from public.multiplayer_games as mg
    where mg.status in ('waiting', 'playing')
      and (
        (
          mg.status = 'waiting'
          and mg.last_activity_at < p_now - interval '30 minutes'
        )
        or (
          mg.status = 'playing'
          and mg.expires_at <= p_now
        )
        or (
          mg.status = 'playing'
          and not exists (
            select 1
            from public.multiplayer_players as connected
            where connected.game_id = mg.id
              and connected.left_at is null
              and connected.is_connected
          )
          and not exists (
            select 1
            from public.multiplayer_players as recent_disconnect
            where recent_disconnect.game_id = mg.id
              and recent_disconnect.left_at is null
              and (
                recent_disconnect.disconnected_at is null
                or recent_disconnect.disconnected_at > p_now - interval '30 minutes'
              )
          )
        )
        or (
          mg.status = 'playing'
          and exists (
            select 1
            from public.multiplayer_players as timed_out
            where timed_out.game_id = mg.id
              and timed_out.left_at is null
              and not timed_out.is_connected
              and timed_out.disconnected_at <= p_now - interval '30 minutes'
          )
        )
      )
    order by mg.created_at, mg.id
    for update of mg skip locked
  loop
    if v_game.status = 'waiting' then
      delete from public.multiplayer_games where id = v_game.id;
      v_count := v_count + 1;
    elsif v_game.expires_at <= p_now then
      perform private.finish_multiplayer_game_locked(v_game.id, p_now, 'expired');
      v_count := v_count + 1;
    else
      select count(*)::integer
      into v_connected_players
      from public.multiplayer_players as mp
      where mp.game_id = v_game.id
        and mp.left_at is null
        and mp.is_connected;

      if v_connected_players = 0 then
        delete from public.multiplayer_games where id = v_game.id;
        v_count := v_count + 1;
      else
        update public.multiplayer_players as mp
        set
          left_at = p_now,
          leave_reason = 'cancelled',
          last_activity_at = p_now
        where mp.game_id = v_game.id
          and mp.left_at is null
          and not mp.is_connected
          and mp.disconnected_at <= p_now - interval '30 minutes';

        get diagnostics v_timed_out_players = row_count;

        if v_timed_out_players > 0 then
          update public.multiplayer_games as mg
          set
            current_players = (
              select count(*)::integer
              from public.multiplayer_players as active_players
              where active_players.game_id = mg.id
                and active_players.left_at is null
            ),
            last_activity_at = p_now,
            version = mg.version + 1
          where mg.id = v_game.id;

          if exists (
            select 1
            from public.multiplayer_games as host_game
            where host_game.id = v_game.id
              and not exists (
                select 1
                from public.multiplayer_players as host_player
                where host_player.game_id = host_game.id
                  and host_player.user_id = host_game.host_id
                  and host_player.left_at is null
              )
          ) then
            perform private.transfer_multiplayer_host_locked(v_game.id, p_now);
          end if;

          v_count := v_count + 1;
        end if;
      end if;
    end if;
  end loop;

  return v_count;
end;
$$;

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

    select count(*)::integer
    into v_remaining_players
    from public.multiplayer_players as mp
    where mp.game_id = v_game.id
      and mp.left_at is null;

    if v_remaining_players = 0 then
      delete from public.multiplayer_games where id = v_game.id;
    else
      update public.multiplayer_games as mg
      set
        current_players = v_remaining_players,
        last_activity_at = v_now,
        version = mg.version + 1
      where mg.id = v_game.id;

      if v_game.host_id = v_user_id then
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
      end if;
    end if;

    v_count := v_count + 1;
  end loop;

  result := 'released';
  released_count := v_count;
  return next;
end;
$$;

revoke all on function private.expire_multiplayer_games(timestamptz) from public;
revoke all on function public.leave_my_active_multiplayer_games() from public;
grant execute on function public.leave_my_active_multiplayer_games() to authenticated;
