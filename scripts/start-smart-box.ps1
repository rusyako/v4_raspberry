$ErrorActionPreference = 'Stop'

function Get-LocalIPv4Address {
  $addresses = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.PrefixOrigin -ne 'WellKnown'
    } |
    Sort-Object InterfaceMetric, SkipAsSource

  foreach ($address in $addresses) {
    if ($address.IPAddress) {
      return $address.IPAddress
    }
  }

  return $null
}

$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$hostPort = if ($env:HOST_PORT) { $env:HOST_PORT } else { '5000' }

Write-Host 'Starting Smart Box...'
docker compose up --build -d

if (-not $?) {
  throw 'Failed to start docker compose.'
}

$localIp = Get-LocalIPv4Address

Write-Host ''
Write-Host 'Smart Box is running.' -ForegroundColor Green

if ($localIp) {
  Write-Host "Kiosk: http://${localIp}:$hostPort/"
  Write-Host "Admin: http://${localIp}:$hostPort/admin"
} else {
  Write-Host "Unable to detect local IPv4 automatically. Use port $hostPort on your current host IP."
}
