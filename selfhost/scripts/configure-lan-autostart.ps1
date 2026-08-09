[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$Uninstall,
  [ValidateNotNullOrEmpty()]
  [string]$TaskName = "Ekko Rules LAN address watcher"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Import-Module ScheduledTasks -ErrorAction Stop

$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root ".runtime"
$watcherPath = Join-Path $PSScriptRoot "watch-lan-ip.ps1"
$pidPath = Join-Path $runtimeDir "lan-watcher.pid"
$addressPath = Join-Path $runtimeDir "lan-address.json"

function Stop-InstalledWatcher {
  if (-not (Test-Path -LiteralPath $pidPath)) { return }
  $recordedPid = (Get-Content -LiteralPath $pidPath -Raw).Trim()
  if ($recordedPid -notmatch '^\d+$') { return }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $recordedPid" -ErrorAction SilentlyContinue
  if ($process -and $process.CommandLine -like "*$watcherPath*") {
    Stop-Process -Id ([int]$recordedPid) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
}

if ($Uninstall) {
  $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($existingTask -and $PSCmdlet.ShouldProcess($taskName, "Unregister scheduled task")) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  }
  if ($PSCmdlet.ShouldProcess($taskName, "Stop the current LAN address watcher")) {
    Stop-InstalledWatcher
    Remove-Item -LiteralPath $addressPath -Force -ErrorAction SilentlyContinue
  }
  Write-Host "Ekko Rules LAN auto-detection has been disabled."
  exit 0
}

[System.IO.Directory]::CreateDirectory($runtimeDir) | Out-Null
$identityName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$powerShellPath = (Get-Process -Id $PID).Path
$watcherArgs = @(
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy", "Bypass",
  "-WindowStyle", "Hidden",
  "-File", "`"$watcherPath`"",
  "-RuntimeDir", "`"$runtimeDir`"",
  "-WebPort", "0"
) -join " "

$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $watcherArgs -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $identityName
$principal = New-ScheduledTaskPrincipal -UserId $identityName -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

if ($PSCmdlet.ShouldProcess($taskName, "Register current-user logon task")) {
  Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Keeps Ekko Rules aware of this computer's current trusted-LAN IPv4 address." `
    -Force | Out-Null
}

Write-Host "Ekko Rules LAN auto-detection will start automatically when $identityName signs in."
