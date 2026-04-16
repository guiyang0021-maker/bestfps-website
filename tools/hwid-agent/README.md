# bestfps HWID Agent

This folder contains the Windows HWID binding agent source.

## Current layout

- `bestfps-hwid.ps1`: functional Windows PowerShell binding agent
- `build-windows.ps1`: wraps the script into `bestfps-hwid.exe` with `ps2exe`
- `dist/windows/bestfps-hwid.exe`: optional compiled output path

## Build on Windows

1. Install PowerShell module:
   `Install-Module -Name ps2exe -Scope CurrentUser`
2. Run:
   `powershell -ExecutionPolicy Bypass -File .\build-windows.ps1`

The server will automatically prefer `dist/windows/bestfps-hwid.exe` when it exists.
