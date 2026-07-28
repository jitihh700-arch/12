$ErrorActionPreference = 'Stop'

$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCommand) {
  $dockerExe = $dockerCommand.Source
} else {
  $dockerPath = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
  if (Test-Path -LiteralPath $dockerPath) {
    $dockerExe = $dockerPath
  } else {
    throw 'Docker CLI introuvable.'
  }
}

$hostId = '52000000-0000-4000-8000-000000000001'
$playerId = '52000000-0000-4000-8000-000000000002'
$submissionId = '52000000-0000-4000-8000-000000000099'

& $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c @"
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
('$hostId', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mp-answer-host@example.test', 'x', now(), now(), now()),
('$playerId', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mp-answer-player@example.test', 'x', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at, created_at, updated_at)
values
('$hostId', 'MPAnswerHost', 'mpanswerhost', now(), now(), now()),
('$playerId', 'MPAnswerPlayer', 'mpanswerplayer', now(), now(), now())
on conflict (id) do update
set pseudo = excluded.pseudo,
    pseudo_normalized = excluded.pseudo_normalized,
    pseudo_changed_at = excluded.pseudo_changed_at,
    updated_at = excluded.updated_at,
    total_points = 0,
    quizzes_completed = 0,
    last_played_at = null;

delete from public.multiplayer_games
where host_id in ('$hostId', '$playerId');
"@

$gameOutput = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -c "set role authenticated; select set_config('request.jwt.claim.sub','$hostId',false); select game_code from public.create_multiplayer_game('series',2);"
$gameCode = ($gameOutput | Where-Object { $_ -match '^[A-HJ-NP-Z2-9]{6}$' } | Select-Object -Last 1)
if (-not $gameCode) {
  throw 'Creation partie multijoueur impossible.'
}

& $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "set role authenticated; select set_config('request.jwt.claim.sub','$playerId',false); select result from public.join_multiplayer_game('$gameCode'); select result from public.set_multiplayer_ready('$gameCode', true); select set_config('request.jwt.claim.sub','$hostId',false); select result from public.start_multiplayer_game('$gameCode');" | Out-Null

$script = "set role authenticated; select set_config('request.jwt.claim.sub','$playerId',false); select result, correct_answers, points_current from public.submit_multiplayer_answer('$gameCode','Walter White','$submissionId');"

$jobA = Start-Job -ScriptBlock {
  param($dockerPath, $sql)
  & $dockerPath exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql 2>&1
  exit $LASTEXITCODE
} -ArgumentList $dockerExe, $script

$jobB = Start-Job -ScriptBlock {
  param($dockerPath, $sql)
  & $dockerPath exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql 2>&1
  exit $LASTEXITCODE
} -ArgumentList $dockerExe, $script

Wait-Job $jobA, $jobB | Out-Null
$outputA = Receive-Job $jobA
$outputB = Receive-Job $jobB
Remove-Job $jobA, $jobB

'--- Session A ---'
$outputA
'--- Session B ---'
$outputB

$combined = ($outputA + $outputB) -join "`n"
$correctCount = ([regex]::Matches($combined, '\bcorrect\s+\|\s+1\s+\|\s+10\b')).Count
$duplicateCount = ([regex]::Matches($combined, '\bduplicate\s+\|\s+1\s+\|\s+10\b')).Count
$final = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -t -A -c "select mp.correct_answers || '|' || mp.score || '|' || (select count(*) from public.multiplayer_answers where player_id=mp.id) from public.multiplayer_players mp join public.multiplayer_games mg on mg.id=mp.game_id where mg.game_code='$gameCode' and mp.user_id='$playerId';"
$finalLine = ($final | Select-Object -Last 1)

if ($correctCount -ne 1 -or $duplicateCount -ne 1 -or $finalLine -ne '1|10|1') {
  throw "Validation concurrence reponse multijoueur echouee. correct=$correctCount duplicate=$duplicateCount final=$finalLine"
}

"Validation concurrence reponse multijoueur OK: une reponse correcte, une duplicate, score=10, lignes=1"
