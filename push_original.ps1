Set-Location $PSScriptRoot

$status = git status --porcelain
if (-not $status) {
  Write-Host "No hay cambios para commitear."
  exit 0
}

$now = Get-Date -Format "yyyyMMdd_HHmmss"

if ($args.Length -gt 0 -and $args[0]) {
  $msg = $args[0]
} else {
  $msg = "auto_sync_original_$now"
}

git add -A
git commit -m $msg
git push origin master

