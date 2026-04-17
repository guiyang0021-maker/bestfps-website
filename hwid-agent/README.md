# bestfps HWID Agent

This folder contains the Windows HWID binding agent source.

## Current layout

- `bestfps-hwid.ps1`: functional Windows PowerShell binding agent
- `bestfps-hwid.js`: Node-based Windows agent source
- `build-windows.ps1`: wraps the PowerShell script into `bestfps-hwid.exe` with `ps2exe`
- `build-windows.js`: packages the Node agent into `bestfps-hwid.exe` with `pkg`
- `dist/windows/bestfps-hwid.exe`: optional compiled output path

## Build on Windows with PowerShell

1. Install PowerShell module:
   `Install-Module -Name ps2exe -Scope CurrentUser`
2. Run:
   `powershell -ExecutionPolicy Bypass -File .\build-windows.ps1`

## Build on macOS / Linux / Windows with Node

1. Ensure Node.js is installed
2. Run:
   `node ./tools/hwid-agent/build-windows.js`

This uses `npx pkg` and outputs:
`tools/hwid-agent/dist/windows/bestfps-hwid.exe`

## Build on GitHub Actions

The repository now includes:
`/.github/workflows/build-hwid-agent.yml`

Run the workflow or push changes under `tools/hwid-agent/` and download the artifact:
`bestfps-hwid-windows`

The server will automatically prefer `dist/windows/bestfps-hwid.exe` when it exists.
