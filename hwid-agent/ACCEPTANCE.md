# HWID C++ Agent Acceptance

This repository now includes two acceptance layers for the future C++ `bestfps-hwid.exe` delivery.

## 1. Static delivery check

Run:

```bash
npm run verify:hwid:cpp
```

This checks:

- `tools/hwid-agent-cpp/` exists
- source files and build entry files exist
- `dist/windows/bestfps-hwid.exe` exists and has a PE header
- obvious hazards are not present in source, such as:
  - disabled TLS certificate checks
  - shell execution via `system`, `_popen`, `cmd.exe`, `powershell.exe`

## 2. Backend contract check

Run:

```bash
npm test -- --runInBand tests/hwid.test.js
```

This locks the current server contract for:

- `POST /api/hwid/prepare`
- `POST /api/hwid/bind`
- `GET /api/hwid/status`
- `DELETE /api/hwid/bindings/:id`

Covered scenarios:

- token file contract
- invalid payload rejection
- first bind success
- same-HWID refresh
- different-HWID conflict
- expired token rejection
- reused token rejection
- IP mismatch rejection
- revoke flow

## 3. Manual Windows acceptance

Use this after Claude delivers the C++ project on Windows:

1. Build Release x64 from the provided CMake or Visual Studio project.
2. Confirm the output file is `bestfps-hwid.exe`.
3. Prepare a token from the website settings page.
4. Put `bestfps-hwid-token.json` next to the exe and run it as a normal user.
5. Repeat with the token file only in `Downloads`.
6. Confirm:
   - success deletes the token file
   - failure keeps the token file
   - same device refreshes
   - different device returns conflict
   - no token is printed to stdout/stderr
   - no TLS warnings or certificate bypass logic exists
