[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$RuntimeDir,
  [ValidateRange(0, 65535)]
  [int]$WebPort = 0,
  [ValidateRange(2, 300)]
  [int]$RefreshSeconds = 5,
  [switch]$Once
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($WebPort -eq 0) {
  $WebPort = 8787
  $root = Split-Path -Parent $RuntimeDir
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

function Get-ActiveLanIpv4 {
  $physicalIndexes = @(
    Get-NetAdapter -Physical |
      Where-Object { $_.Status -eq "Up" } |
      Select-Object -ExpandProperty ifIndex
  )
  $allRoutes = @(
    Get-NetRoute -DestinationPrefix "0.0.0.0/0" -AddressFamily IPv4 |
      Where-Object { $_.State -eq "Alive" -and $_.NextHop -ne "0.0.0.0" } |
      Sort-Object @{ Expression = { $_.RouteMetric + $_.InterfaceMetric } }
  )
  $routes = @($allRoutes | Where-Object { $_.InterfaceIndex -in $physicalIndexes })
  if ($routes.Count -eq 0) { $routes = $allRoutes }

  foreach ($route in $routes) {
    $address = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 |
      Where-Object {
        $_.AddressState -eq "Preferred" -and
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*"
      } |
      Select-Object -ExpandProperty IPAddress -First 1
    if ($address) { return $address }
  }
  throw "No active LAN IPv4 address was found."
}

function Write-LanAddress {
  $ipv4 = Get-ActiveLanIpv4
  $payload = [ordered]@{
    ipv4 = $ipv4
    baseUrl = "http://${ipv4}:$WebPort"
    updatedAt = [DateTimeOffset]::UtcNow.ToString("o")
    source = "windows-default-route"
  } | ConvertTo-Json -Compress

  [System.IO.Directory]::CreateDirectory($RuntimeDir) | Out-Null
  $target = Join-Path $RuntimeDir "lan-address.json"
  [System.IO.File]::WriteAllText(
    $target,
    $payload,
    [System.Text.UTF8Encoding]::new($false)
  )
  return $ipv4
}

if ($Once) {
  Write-LanAddress
  exit 0
}

$pidPath = Join-Path $RuntimeDir "lan-watcher.pid"
[System.IO.Directory]::CreateDirectory($RuntimeDir) | Out-Null
[System.IO.File]::WriteAllText($pidPath, [string]$PID)
try {
  while ($true) {
    try { Write-LanAddress | Out-Null } catch { }
    Start-Sleep -Seconds $RefreshSeconds
  }
} finally {
  if (Test-Path -LiteralPath $pidPath) {
    $recordedPid = (Get-Content -LiteralPath $pidPath -Raw).Trim()
    if ($recordedPid -eq [string]$PID) {
      Remove-Item -LiteralPath $pidPath -Force
    }
  }
}
