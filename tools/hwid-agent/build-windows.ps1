param(
  [string]$OutputDir = "$PSScriptRoot\dist\windows"
)

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'bestfps-hwid.ps1'
$outputPath = Join-Path $OutputDir 'bestfps-hwid.exe'

if (-not (Get-Command Invoke-ps2exe -ErrorAction SilentlyContinue)) {
  throw "Invoke-ps2exe is required. Run: Install-Module -Name ps2exe -Scope CurrentUser"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Invoke-ps2exe `
  -InputFile $scriptPath `
  -OutputFile $outputPath `
  -Title 'bestfps HWID Binder' `
  -Description 'Bind the current Windows device HWID to a bestfps account' `
  -Company 'bestfps' `
  -Product 'bestfps HWID Binder' `
  -Version '1.0.0' `
  -NoConsole

Write-Host "Built: $outputPath"
