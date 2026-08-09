[CmdletBinding()]
param(
  [switch]$NoBuild,
  [int]$WebPort = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$runtimeDir = Join-Path $root ".runtime"
$watcherPath = Join-Path $root "scripts\watch-lan-ip.ps1"
$pidPath = Join-Path $runtimeDir "lan-watcher.pid"

if ($WebPort -eq 0) {
  $WebPort = 8787
  $envPath = Join-Path $root ".env"
  if (Test-Path -LiteralPath $envPath) {
    $portLine = Get-Content -LiteralPath $envPath |
      Where-Object { $_ -match '^\s*WEB_PORT\s*=\s*\d+\s*$' } |
      Select-Object -Last 1
    if ($portLine) {
      $WebPort = [int](($portLine -split "=", 2)[1].Trim())
    }
  }
}
if ($WebPort -lt 1 -or $WebPort -gt 65535) {
  throw "WEB_PORT must be between 1 and 65535."
}

[System.IO.Directory]::CreateDirectory($runtimeDir) | Out-Null
$detectedIp = $null
try {
  $detectedIp = & $watcherPath -RuntimeDir $runtimeDir -WebPort $WebPort -Once
} catch {
  Remove-Item -LiteralPath (Join-Path $runtimeDir "lan-address.json") -Force -ErrorAction SilentlyContinue
  Write-Warning "LAN IP detection is not available yet; Compose will still start."
}

Push-Location $root
try {
  $composeArgs = @("compose", "up")
  if (-not $NoBuild) { $composeArgs += "--build" }
  $composeArgs += "-d"
  & docker @composeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose up failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

$watcherRunning = $false
if (Test-Path -LiteralPath $pidPath) {
  $existingPid = (Get-Content -LiteralPath $pidPath -Raw).Trim()
  if ($existingPid -match '^\d+$') {
    $existingProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $existingPid" -ErrorAction SilentlyContinue
    $watcherRunning = [bool](
      $existingProcess -and $existingProcess.CommandLine -like "*$watcherPath*"
    )
  }
}

if (-not $watcherRunning) {
  $powerShellPath = (Get-Process -Id $PID).Path
  $watcherArgs = @(
    "-NoProfile",
    "-File", "`"$watcherPath`"",
    "-RuntimeDir", "`"$runtimeDir`"",
    "-WebPort", [string]$WebPort
  )
  $watcher = Start-Process -FilePath $powerShellPath -ArgumentList $watcherArgs -WindowStyle Hidden -PassThru
  [System.IO.File]::WriteAllText($pidPath, [string]$watcher.Id)
}

Write-Host ""
Write-Host "Ekko Rules is ready:"
Write-Host "  Computer: http://localhost:$WebPort"
if ($detectedIp) {
  Write-Host "  Trusted LAN: http://${detectedIp}:$WebPort"
} else {
  Write-Host "  Trusted LAN: waiting for an active network"
}
Write-Host ""
Write-Host "The LAN address watcher will refresh automatically when the network changes."
