# UIU-BUS auto-sync: local E:\uiu-bus -> GitHub origin/main -> Vercel auto-deploy
# Polls git status every 20s, pushes any change. Reliable, no event-scope issues.
# Log: E:\uiu-bus\tools\auto-sync.log (git-ignored)
# Run hidden: Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','E:\uiu-bus\tools\auto-sync.ps1'

$ErrorActionPreference = 'SilentlyContinue'
$Repo = 'E:\uiu-bus'
$Log = Join-Path $Repo 'tools\auto-sync.log'

function Log($msg) {
  Add-Content -LiteralPath $Log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
}

Log '--- auto-sync started (poll 20s) ---'
Set-Location -LiteralPath $Repo

while ($true) {
  Start-Sleep -Seconds 20
  Set-Location -LiteralPath $Repo
  git add -A 2>&1 | Out-Null
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    $msg = "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    git commit -m $msg 2>&1 | Out-Null
    $pushOut = (git push origin main 2>&1 | Out-String).Trim().Replace("`r`n", ' ')
    Log "pushed $msg :: $pushOut"
  }
}
