# BestFPS HWID Agent (C++ Edition)

Secure and lightweight C++ implementation of the BestFPS HWID binding agent.

## Features

- Pure Windows API implementation (no external dependencies)
- SHA-256 hardware fingerprinting
- Secure memory handling
- Colorful console UI with ASCII art
- Progress animations
- Built with Visual Studio 2022 / MSVC

## Build Requirements

- Windows 10/11
- Visual Studio 2022 with C++ tools
- CMake 3.15+

## Quick Build

```batch
cd tools/hwid-agent-cpp
build.bat
```

Or with CMake directly:

```batch
mkdir build
cd build
cmake -G "Visual Studio 17 2022" -A x64 ..
cmake --build . --config Release
```

## Project Structure

- `CMakeLists.txt` - Build configuration
- `src/` - Source files
  - `main.cpp` - Entry point (no header file)
  - `hardware.cpp` / `hardware.h` - Hardware detection
  - `network.cpp` / `network.h` - HTTP networking
  - `json.cpp` / `json.h` - JSON parsing
  - `crypto.cpp` / `crypto.h` - SHA-256 hashing
  - `console.cpp` / `console.h` - Console UI
- `build.bat` - Build script
- `dist/windows/` - Output directory

Expected output:

- `dist/windows/bestfps-hwid.exe`

## Security

- No external dependencies (uses only Windows APIs)
- SHA-256 for hardware fingerprinting
- JSON injection protection
- Secure memory handling
- Uses WinHTTP with default TLS certificate validation enabled
