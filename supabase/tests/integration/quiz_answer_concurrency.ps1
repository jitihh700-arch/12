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

$userId = '30000000-0000-4000-8000-000000000001'

& $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c @"
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('$userId', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'quiz-answer-concurrency@example.test', 'x', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at, created_at, updated_at)
values ('$userId', 'QuizAnswerUser', 'quizansweruser', now(), now(), now())
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
"@

$sessionOutput = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -c "set role authenticated; select set_config('request.jwt.claim.sub','$userId',false); select session_id from public.start_quiz_session('series');"
$sessionId = ($sessionOutput | Where-Object { $_ -match '^[0-9a-f-]{36}$' } | Select-Object -Last 1)
if (-not $sessionId) {
  throw 'Creation de session quiz impossible.'
}

$script = "set role authenticated; select set_config('request.jwt.claim.sub','$userId',false); select result, correct_answers, points_current from public.submit_quiz_answer('$sessionId','Walter White');"

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

$final = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -t -A -c "select correct_answers || '|' || points_awarded || '|' || (select count(*) from public.quiz_session_answers where session_id='$sessionId') from public.quiz_sessions where id='$sessionId';"
$finalLine = ($final | Select-Object -Last 1)

if ($correctCount -ne 1 -or $duplicateCount -ne 1 -or $finalLine -ne '1|0|1') {
  throw "Validation double reponse echouee. correct=$correctCount duplicate=$duplicateCount final=$finalLine"
}

"Validation double reponse quiz OK: une reponse correcte, une duplicate, correct_answers=1, points_awarded=0, lignes=1"
