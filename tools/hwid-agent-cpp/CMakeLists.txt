cmake_minimum_required(VERSION 3.15)
project(bestfps-hwid VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Windows-specific settings
add_definitions(-D_CRT_SECURE_NO_WARNINGS)
if(MSVC)
    add_compile_options(/W4 /WX- /utf-8)
endif()

# Output directory and executable name
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_DEBUG "${CMAKE_SOURCE_DIR}/dist/windows")
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_SOURCE_DIR}/dist/windows")

# Source files
add_executable(bestfps-hwid
    src/main.cpp
    src/hardware.cpp
    src/network.cpp
    src/json.cpp
    src/crypto.cpp
    src/console.cpp
)

# Link Windows libraries
target_link_libraries(bestfps-hwid
    winhttp
    crypt32
    advapi32
    ole32
    oleaut32
    wbemuuid
)
