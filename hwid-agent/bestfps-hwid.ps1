Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$AgentVersion = '1.0.0'
$TokenFileName = 'bestfps-hwid-token.json'

function Write-Status {
  param([string]$Message)
  Write-Host "[bestfps-hwid] $Message"
}

function Get-TokenPath {
  $candidates = @()

  if ($PSScriptRoot) {
    $candidates += (Join-Path $PSScriptRoot $TokenFileName)
  }

  $downloadsDir = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'
  $candidates += (Join-Path $downloadsDir $TokenFileName)

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return $candidate
    }
  }

  throw "Token file '$TokenFileName' was not found next to the script or in Downloads."
}

function Get-RegistryValue {
  param(
    [string]$Path,
    [string]$Name
  )

  try {
    return (Get-ItemProperty -Path $Path -Name $Name -ErrorAction Stop).$Name
  } catch {
    return ''
  }
}

function Get-CimPropertyValue {
  param(
    [string]$ClassName,
    [string]$PropertyName
  )

  try {
    $instance = Get-CimInstance -ClassName $ClassName -ErrorAction Stop | Select-Object -First 1
    if ($null -eq $instance) { return '' }
    return $instance.$PropertyName
  } catch {
    return ''
  }
}

function Get-Sha256Hex {
  param([string]$Value)

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
    $hashBytes = $sha.ComputeHash($bytes)
    return -join ($hashBytes | ForEach-Object { $_.ToString('x2') })
  } finally {
    $sha.Dispose()
  }
}

try {
  $tokenPath = Get-TokenPath
  Write-Status "Using token file: $tokenPath"

  $config = Get-Content -LiteralPath $tokenPath -Raw | ConvertFrom-Json
  if (-not $config.token -or -not $config.bind_url) {
    throw 'The token file is missing required fields.'
  }

  $machineGuid = Get-RegistryValue -Path 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name 'MachineGuid'
  $biosSerial = Get-CimPropertyValue -ClassName 'Win32_BIOS' -PropertyName 'SerialNumber'
  $boardSerial = Get-CimPropertyValue -ClassName 'Win32_BaseBoard' -PropertyName 'SerialNumber'
  $cpuId = Get-CimPropertyValue -ClassName 'Win32_Processor' -PropertyName 'ProcessorId'
  $deviceName = [Environment]::MachineName
  $osName = [Environment]::OSVersion.VersionString

  $hwidParts = @($machineGuid, $biosSerial, $boardSerial, $cpuId, $deviceName) | Where-Object {
    $_ -and $_.ToString().Trim().Length -gt 0
  }

  if ($hwidParts.Count -eq 0) {
    throw 'No usable hardware identifiers were collected.'
  }

  $hwidSource = $hwidParts -join '|'
  $hwidHash = Get-Sha256Hex -Value $hwidSource

  $payload = @{
    token = [string]$config.token
    hwid_hash = $hwidHash
    device_name = $deviceName
    os_name = $osName
    agent_version = $AgentVersion
  } | ConvertTo-Json

  Write-Status "Binding HWID for account #$($config.account_id)..."

  $response = Invoke-RestMethod -Method Post -Uri ([string]$config.bind_url) -ContentType 'application/json' -Body $payload

  Write-Status ($response.message | ForEach-Object { $_ })
  try {
    Remove-Item -LiteralPath $tokenPath -Force -ErrorAction Stop
    Write-Status 'One-time token file removed.'
  } catch {
    Write-Status 'Token file could not be removed automatically.'
  }

  Write-Host ''
  Write-Host 'HWID binding completed successfully.'
} catch {
  Write-Error $_
  Write-Host ''
  Write-Host 'HWID binding failed.'
}

Write-Host ''
Read-Host 'Press Enter to exit'
