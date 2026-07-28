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

$userA = '99999999-aaaa-4000-8000-000000000001'
$userB = '99999999-bbbb-4000-8000-000000000002'
$secretContent = 'Contenu supprime confidentiel'

function Invoke-ExpectedSqlFailure {
  param([string]$Sql)

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=0 -t -A -c $Sql 2>&1
    return @{
      ExitCode = $LASTEXITCODE
      Output = ($output -join "`n")
    }
  } finally {
    $ErrorActionPreference = $previousPreference
  }
}

& $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c @"
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('$userA', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'direct-a@example.test', 'x', now(), now(), now()),
  ('$userB', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'direct-b@example.test', 'x', now(), now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, pseudo, pseudo_normalized, pseudo_changed_at)
values
  ('$userA', 'DirectUserA', 'directusera', now()),
  ('$userB', 'DirectUserB', 'directuserb', now())
on conflict (id) do nothing;

delete from public.comments where user_id in ('$userA', '$userB');
"@

$createOutput = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -c "set role authenticated; select set_config('request.jwt.claim.sub','$userA',false); select comment_id from public.create_comment('$secretContent');"
$commentId = ($createOutput | Where-Object { $_ -match '^[0-9a-f-]{36}$' } | Select-Object -Last 1)
if (-not $commentId) {
  throw 'Creation du commentaire de test impossible.'
}

$directBefore = Invoke-ExpectedSqlFailure "set role authenticated; select set_config('request.jwt.claim.sub','$userB',false); select content from public.comments where id='$commentId';"
if ($directBefore.ExitCode -eq 0 -and $directBefore.Output -match [regex]::Escape($secretContent)) {
  throw 'Fuite: utilisateur B lit directement le commentaire de A avant suppression.'
}
if ($directBefore.Output -notmatch 'permission denied') {
  throw "SELECT direct avant suppression n'a pas ete refuse clairement: $directBefore"
}

$listBefore = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -c "set role authenticated; select set_config('request.jwt.claim.sub','$userB',false); select content from public.list_comments(50,0) where comment_id='$commentId';"
if (($listBefore -join "`n") -notmatch [regex]::Escape($secretContent)) {
  throw 'list_comments ne retourne pas le commentaire visible avant suppression.'
}

& $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "set role authenticated; select set_config('request.jwt.claim.sub','$userA',false); select * from public.delete_my_comment('$commentId');" | Out-Null

$listAfter = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A -c "set role authenticated; select set_config('request.jwt.claim.sub','$userB',false); select count(*) from public.list_comments(50,0) where comment_id='$commentId';"
if (($listAfter | Select-Object -Last 1) -ne '0') {
  throw 'list_comments retourne encore le commentaire apres soft delete.'
}

$directAfter = Invoke-ExpectedSqlFailure "set role authenticated; select set_config('request.jwt.claim.sub','$userB',false); select content from public.comments where id='$commentId';"
if ($directAfter.ExitCode -eq 0 -and $directAfter.Output -match [regex]::Escape($secretContent)) {
  throw 'Fuite: utilisateur B recupere le contenu supprime par SELECT direct.'
}
if ($directAfter.Output -notmatch 'permission denied') {
  throw "SELECT direct apres suppression n'a pas ete refuse clairement: $directAfter"
}

$adminCount = & $dockerExe exec -i supabase_db_12 psql -U postgres -d postgres -t -A -c "select count(*) from public.comments where id='$commentId' and deleted_at is not null;"
if (($adminCount | Select-Object -Last 1) -ne '1') {
  throw 'La ligne soft-deleted nest pas presente physiquement pour le role admin de test.'
}

'Validation acces direct commentaires OK: SELECT direct refuse, list_comments controle la lecture, soft delete non recuperable par authenticated.'
