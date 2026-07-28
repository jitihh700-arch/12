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

$userId = '88888888-8888-8888-8888-888888888888'

& $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c @"
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('$userId', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'comments-concurrency@example.test', 'x', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at, created_at, updated_at)
values ('$userId', 'CommentsLimitUser', 'commentslimituser', now(), now(), now())
on conflict (id) do update
set pseudo = excluded.pseudo,
    pseudo_normalized = excluded.pseudo_normalized,
    pseudo_changed_at = excluded.pseudo_changed_at,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

delete from public.comments where user_id = '$userId';

insert into public.comments (user_id, content)
select '$userId', 'Preload ' || g::text
from generate_series(1, 49) as g;
"@

$scriptA = "set role authenticated; select set_config('request.jwt.claim.sub','$userId',false); select 'A' as worker, comment_id from public.create_comment('Concurrent A');"
$scriptB = "set role authenticated; select set_config('request.jwt.claim.sub','$userId',false); select 'B' as worker, comment_id from public.create_comment('Concurrent B');"

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

'--- Session A ---'
$outputA
'--- Session B ---'
$outputB

Remove-Job $jobA, $jobB

$finalCount = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -t -A -c "select count(*) from public.comments where user_id='$userId' and deleted_at is null;"
$successCount = @($outputA + $outputB | Where-Object { $_ -match '^\s*[AB]\s+\|' }).Count
$limitCount = @($outputA + $outputB | Where-Object { $_ -match 'comment_limit_reached' }).Count

if ($finalCount -ne '50' -or $successCount -ne 1 -or $limitCount -ne 1) {
  throw "Validation concurrence commentaires echouee. final=$finalCount success=$successCount limit=$limitCount"
}

"Validation concurrence commentaires OK: une creation reussit, l'autre echoue avec comment_limit_reached, total=$finalCount"
