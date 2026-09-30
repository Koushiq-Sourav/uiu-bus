# UIU-BUS auto-sync: local E:\uiu-bus -> GitHub origin/main -> Vercel auto-deploy
# Polls git status every 20s, pushes any change. Reliable, no event-scope issues.
# Also pings the Telegram nearby-alert endpoint every ~60s (replaces the old
# visible "UIU-BUS notify" scheduled task, which flashed a curl window).
# Fully silent: no console output, errors swallowed. Log is git-ignored.
# Run hidden: Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','E:\uiu-bus\tools\auto-sync.ps1'

$ErrorActionPreference = 'SilentlyContinue'
$Repo = 'E:\uiu-bus'
$Log = Join-Path $Repo 'tools\auto-sync.log'
$NotifyUrl = 'http://localhost:8080/api/notify_nearby.php?all=1'

function Log($msg) {
  Add-Content -LiteralPath $Log -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
}

Log '--- auto-sync started (poll 20s + silent notify 60s) ---'
Set-Location -LiteralPath $Repo
$tick = 0

while ($true) {
  Start-Sleep -Seconds 20
  $tick++
  Set-Location -LiteralPath $Repo
  git add -A 2>&1 | Out-Null
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    $msg = "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    git commit -m $msg 2>&1 | Out-Null
    $pushOut = (git push origin main 2>&1 | Out-String).Trim().Replace("`r`n", ' ')
    Log "pushed $msg :: $pushOut"
  }
  # Silent Telegram cron (every 3rd tick ~= 60s). No-op when docker is down.
  if ($tick % 3 -eq 0) {
    try { Invoke-WebRequest -Uri $NotifyUrl -TimeoutSec 10 -UseBasicParsing | Out-Null } catch {}
  }
}
