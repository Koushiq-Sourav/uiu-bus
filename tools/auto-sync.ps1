# UIU-BUS auto-sync: local E:\uiu-bus -> GitHub origin/main -> Vercel auto-deploy
# Watches files (excluding .git/.vercel/node_modules), debounces 15s, then add/commit/push.
# Log: E:\uiu-bus\tools\auto-sync.log
# Run hidden: Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','E:\uiu-bus\tools\auto-sync.ps1'

$ErrorActionPreference = 'SilentlyContinue'
$Repo = 'E:\uiu-bus'
$Log = Join-Path $Repo 'tools\auto-sync.log'
$DebounceSec = 15

function Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -LiteralPath $Log -Value $line
}

Log '--- auto-sync started ---'

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $Repo
$watcher.IncludeSubdirectories = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::FileName -bor [System.IO.NotifyFilters]::DirectoryName
$watcher.EnableRaisingEvents = $true

$lastRun = Get-Date
$pending = $false

function ShouldIgnore($path) {
  if (-not $path) { return $true }
  $p = $path.Replace('/', '\')
  if ($p -like '*\.git\*') { return $true }
  if ($p -like '*\.vercel\*') { return $true }
  if ($p -like '*\node_modules\*') { return $true }
  if ($p -like '*\tools\auto-sync.log') { return $true }
  if ($p -like '*.tmp') { return $true }
  if ($p -like '*.log') { return $true }
  return $false
}

Register-ObjectEvent $watcher 'Changed' -Action {
  if (-not (ShouldIgnore $Event.SourceEventArgs.FullPath)) { Set-Variable -Name pending -Value $true -Scope Global; Set-Variable -Name lastRun -Value (Get-Date) -Scope Global }
} | Out-Null
Register-ObjectEvent $watcher 'Created' -Action {
  if (-not (ShouldIgnore $Event.SourceEventArgs.FullPath)) { Set-Variable -Name pending -Value $true -Scope Global; Set-Variable -Name lastRun -Value (Get-Date) -Scope Global }
} | Out-Null
Register-ObjectEvent $watcher 'Deleted' -Action {
  if (-not (ShouldIgnore $Event.SourceEventArgs.FullPath)) { Set-Variable -Name pending -Value $true -Scope Global; Set-Variable -Name lastRun -Value (Get-Date) -Scope Global }
} | Out-Null
Register-ObjectEvent $watcher 'Renamed' -Action {
  if (-not (ShouldIgnore $Event.SourceEventArgs.FullPath)) { Set-Variable -Name pending -Value $true -Scope Global; Set-Variable -Name lastRun -Value (Get-Date) -Scope Global }
} | Out-Null

while ($true) {
  Start-Sleep -Seconds 5
  if ($pending -and ((Get-Date) - $lastRun).TotalSeconds -ge $DebounceSec) {
    $pending = $false
    Set-Location -LiteralPath $Repo
    git add -A 2>&1 | Out-Null
    $hasStaged = $false
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) { $hasStaged = $true }
    if ($hasStaged) {
      $msg = "auto: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
      git commit -m $msg 2>&1 | Out-Null
      $pushOut = git push origin main 2>&1 | Out-String
      Log "pushed $msg :: $pushOut".Replace("`r`n", ' ')
    }
  }
}
