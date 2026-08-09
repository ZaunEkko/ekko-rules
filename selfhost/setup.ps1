[CmdletBinding()]
param(
  [switch]$NoBuild,
  [int]$WebPort = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$startPath = Join-Path $PSScriptRoot "start.ps1"
$autoStartPath = Join-Path $PSScriptRoot "scripts\configure-lan-autostart.ps1"

$startArgs = @{}
if ($NoBuild) { $startArgs.NoBuild = $true }
if ($WebPort -ne 0) { $startArgs.WebPort = $WebPort }

& $startPath @startArgs
& $autoStartPath

Write-Host ""
Write-Host "Setup complete. Docker Desktop may manage the containers from now on."
Write-Host "The LAN address helper will return automatically after future sign-ins."
