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

$userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

& $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c @"
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('$userId', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'concurrency@example.test', 'x', now(), now(), now())
on conflict (id) do nothing;
insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at, created_at, updated_at)
values ('$userId', 'ConcurrentBase', 'concurrentbase', now() - interval '15 days', now() - interval '16 days', now() - interval '15 days')
on conflict (id) do update
set pseudo = excluded.pseudo,
    pseudo_normalized = excluded.pseudo_normalized,
    created_at = excluded.created_at,
    pseudo_changed_at = excluded.pseudo_changed_at,
    updated_at = excluded.updated_at;
"@

$scriptA = "set role authenticated; select set_config('request.jwt.claim.sub','$userId',false); select 'A' as worker, pseudo from public.change_my_pseudo('Concurrent_A');"
$scriptB = "set role authenticated; select set_config('request.jwt.claim.sub','$userId',false); select 'B' as worker, pseudo from public.change_my_pseudo('Concurrent_B');"

$jobA = Start-Job -ScriptBlock {
  param($dockerPath, $script)
  & $dockerPath exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $script 2>&1
  exit $LASTEXITCODE
} -ArgumentList $dockerExe, $scriptA

$jobB = Start-Job -ScriptBlock {
  param($dockerPath, $script)
  & $dockerPath exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $script 2>&1
  exit $LASTEXITCODE
} -ArgumentList $dockerExe, $scriptB

Wait-Job $jobA, $jobB | Out-Null

$outputA = Receive-Job $jobA
$outputB = Receive-Job $jobB
$failedCount = @($jobA, $jobB | Where-Object { $_.State -eq 'Failed' }).Count

'--- Session A ---'
$outputA
'--- Session B ---'
$outputB

Remove-Job $jobA, $jobB

$final = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -t -A -c "select pseudo from public.profiles where id='$userId';"
$tooSoonCount = @($outputA + $outputB | Where-Object { $_ -match 'pseudo_change_too_soon' }).Count
$successCount = @($outputA + $outputB | Where-Object { $_ -match 'Concurrent_A|Concurrent_B' }).Count

if ($tooSoonCount -ne 1 -or $successCount -lt 1 -or $final -notmatch '^Concurrent_[AB]$') {
  throw "Validation concurrence echouee. tooSoon=$tooSoonCount success=$successCount final=$final"
}

"Validation concurrence OK: une session reussit, l'autre echoue avec pseudo_change_too_soon, final=$final"
