@echo off
setlocal

REM Check for CMake
where cmake >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Error: CMake is not installed or not in PATH
    echo Please install CMake 3.15 or later from https://cmake.org/download/
    exit /b 1
)

REM Create build directory if it doesn't exist
if not exist build (
    echo Creating build directory...
    mkdir build
    if %ERRORLEVEL% neq 0 (
        echo Error: Failed to create build directory
        exit /b 1
    )
)

REM Configure with CMake
echo Configuring project with CMake...
cmake -G "Visual Studio 17 2022" -A x64 -S . -B build
if %ERRORLEVEL% neq 0 (
    echo Error: CMake configuration failed
    exit /b 1
)

REM Build the project
echo Building project...
cmake --build build --config Release
if %ERRORLEVEL% neq 0 (
    echo Error: Build failed
    exit /b 1
)

REM Create dist/windows directory if it doesn't exist
if not exist dist (
    mkdir dist
)
if not exist dist\windows (
    mkdir dist\windows
)

REM Copy the executable to dist/windows
echo Copying executable to dist\windows...
copy /Y build\Release\bestfps-hwid.exe dist\windows\bestfps-hwid.exe >nul
if %ERRORLEVEL% neq 0 (
    echo Error: Failed to copy executable
    exit /b 1
)

echo Build completed successfully!
echo Executable location: dist\windows\bestfps-hwid.exe
exit /b 0
