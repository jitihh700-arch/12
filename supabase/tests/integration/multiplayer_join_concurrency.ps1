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

$hostId = '51000000-0000-4000-8000-000000000001'
$playerA = '51000000-0000-4000-8000-000000000002'
$playerB = '51000000-0000-4000-8000-000000000003'
$candidateA = '51000000-0000-4000-8000-000000000004'
$candidateB = '51000000-0000-4000-8000-000000000005'

& $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c @"
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
('$hostId', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mp-join-host@example.test', 'x', now(), now(), now()),
('$playerA', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mp-join-a@example.test', 'x', now(), now(), now()),
('$playerB', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mp-join-b@example.test', 'x', now(), now(), now()),
('$candidateA', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mp-join-candidate-a@example.test', 'x', now(), now(), now()),
('$candidateB', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mp-join-candidate-b@example.test', 'x', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at, created_at, updated_at)
values
('$hostId', 'MPJoinHost', 'mpjoinhost', now(), now(), now()),
('$playerA', 'MPJoinA', 'mpjoina', now(), now(), now()),
('$playerB', 'MPJoinB', 'mpjoinb', now(), now(), now()),
('$candidateA', 'MPJoinCandidateA', 'mpjoincandidatea', now(), now(), now()),
('$candidateB', 'MPJoinCandidateB', 'mpjoincandidateb', now(), now(), now())
on conflict (id) do update
set pseudo = excluded.pseudo,
    pseudo_normalized = excluded.pseudo_normalized,
    pseudo_changed_at = excluded.pseudo_changed_at,
    updated_at = excluded.updated_at,
    total_points = 0,
    quizzes_completed = 0,
    last_played_at = null;

delete from public.multiplayer_games
where host_id in ('$hostId', '$playerA', '$playerB', '$candidateA', '$candidateB');
"@

$gameOutput = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -c "set role authenticated; select set_config('request.jwt.claim.sub','$hostId',false); select game_code from public.create_multiplayer_game('series',4);"
$gameCode = ($gameOutput | Where-Object { $_ -match '^[A-HJ-NP-Z2-9]{6}$' } | Select-Object -Last 1)
if (-not $gameCode) {
  throw 'Creation partie multijoueur impossible.'
}

& $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "set role authenticated; select set_config('request.jwt.claim.sub','$playerA',false); select result from public.join_multiplayer_game('$gameCode'); select set_config('request.jwt.claim.sub','$playerB',false); select result from public.join_multiplayer_game('$gameCode');" | Out-Null

$scriptA = "set role authenticated; select set_config('request.jwt.claim.sub','$candidateA',false); select 'A' as worker, result from public.join_multiplayer_game('$gameCode');"
$scriptB = "set role authenticated; select set_config('request.jwt.claim.sub','$candidateB',false); select 'B' as worker, result from public.join_multiplayer_game('$gameCode');"

$jobA = Start-Job -ScriptBlock {
  param($dockerPath, $sql)
  & $dockerPath exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql 2>&1
  exit $LASTEXITCODE
} -ArgumentList $dockerExe, $scriptA

$jobB = Start-Job -ScriptBlock {
  param($dockerPath, $sql)
  & $dockerPath exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql 2>&1
  exit $LASTEXITCODE
} -ArgumentList $dockerExe, $scriptB

Wait-Job $jobA, $jobB | Out-Null
$outputA = Receive-Job $jobA
$outputB = Receive-Job $jobB
Remove-Job $jobA, $jobB

'--- Session A ---'
$outputA
'--- Session B ---'
$outputB

$combined = ($outputA + $outputB) -join "`n"
$joinedCount = ([regex]::Matches($combined, '\bjoined\b')).Count
$fullCount = ([regex]::Matches($combined, 'game_full')).Count
$final = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -t -A -c "select current_players || '|' || (select count(*) from public.multiplayer_players where game_id=mg.id and left_at is null) from public.multiplayer_games mg where game_code='$gameCode';"
$finalLine = ($final | Select-Object -Last 1)

if ($joinedCount -ne 1 -or $fullCount -ne 1 -or $finalLine -ne '4|4') {
  throw "Validation concurrence join echouee. joined=$joinedCount full=$fullCount final=$finalLine"
}

"Validation concurrence join OK: une entree reussit, une entree echoue avec game_full, total=$finalLine"
