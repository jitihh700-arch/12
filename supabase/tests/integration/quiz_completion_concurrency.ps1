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

$userId = '30000000-0000-4000-8000-000000000002'

& $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c @"
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('$userId', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'quiz-completion-concurrency@example.test', 'x', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at, created_at, updated_at, total_points, quizzes_completed, last_played_at)
values ('$userId', 'QuizCompleteUser', 'quizcompleteuser', now(), now(), now(), 0, 0, null)
on conflict (id) do update
set pseudo = excluded.pseudo,
    pseudo_normalized = excluded.pseudo_normalized,
    pseudo_changed_at = excluded.pseudo_changed_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    total_points = 0,
    quizzes_completed = 0,
    last_played_at = null;

delete from public.quiz_sessions where user_id = '$userId';
delete from public.user_category_stats where user_id = '$userId';
"@

$sessionOutput = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -c "set role authenticated; select set_config('request.jwt.claim.sub','$userId',false); select session_id from public.start_quiz_session('series');"
$sessionId = ($sessionOutput | Where-Object { $_ -match '^[0-9a-f-]{36}$' } | Select-Object -Last 1)
if (-not $sessionId) {
  throw 'Creation de session quiz impossible.'
}

& $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "set role authenticated; select set_config('request.jwt.claim.sub','$userId',false); select result from public.submit_quiz_answer('$sessionId','Walter White'); select result from public.submit_quiz_answer('$sessionId','Jon Snow');" | Out-Null

$script = "set role authenticated; select set_config('request.jwt.claim.sub','$userId',false); select result, points_awarded, status from public.complete_quiz_session('$sessionId');"

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
$completedCount = ([regex]::Matches($combined, '\bcompleted\s+\|\s+20\s+\|\s+completed\b')).Count
$alreadyCount = ([regex]::Matches($combined, '\balready_completed\s+\|\s+20\s+\|\s+completed\b')).Count

$final = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -t -A -c "select p.total_points || '|' || p.quizzes_completed || '|' || coalesce((select total_points || '|' || correct_answers || '|' || quizzes_completed from public.user_category_stats where user_id='$userId' and category_id='series'),'missing') from public.profiles as p where p.id='$userId';"
$finalLine = ($final | Select-Object -Last 1)

if ($completedCount -ne 1 -or $alreadyCount -ne 1 -or $finalLine -ne '20|1|20|2|1') {
  throw "Validation double finalisation echouee. completed=$completedCount already=$alreadyCount final=$finalLine"
}

"Validation double finalisation quiz OK: credit profil=20, quizzes_completed=1, stats categorie=20/2/1"
