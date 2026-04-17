#include "console.h"
#include <iostream>
#include <iomanip>

#ifdef _WIN32
#include <windows.h>
#endif

namespace console {

static HANDLE hConsole_ = nullptr;
static bool colorsEnabled_ = false;

void enableColors() {
#ifdef _WIN32
    hConsole_ = GetStdHandle(STD_OUTPUT_HANDLE);
    if (hConsole_) {
        DWORD mode = 0;
        if (GetConsoleMode(hConsole_, &mode)) {
            SetConsoleMode(hConsole_, mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING);
            colorsEnabled_ = true;
        }
    }
#else
    colorsEnabled_ = true;
#endif
}

void setColor(Color color) {
    if (colorsEnabled_) {
        std::cout << "\033[" << static_cast<int>(color) << "m";
    }
}

void resetColor() {
    if (colorsEnabled_) {
        std::cout << "\033[0m";
    }
}

void print(Color color, const std::string& msg) {
    setColor(color);
    std::cout << msg;
    resetColor();
    std::cout << std::endl;
}

void printBanner() {
    if (!colorsEnabled_) return;
    std::cout << R"(
██╗  ██╗██╗   ██╗███╗   ██╗ ██████╗ ███████╗ ██████╗ ███╗   ██╗
██║  ██║██║   ██║████╗  ██║██╔════╝ ██╔════╝██╔═══██╗████╗  ██║
███████║██║   ██║██╔██╗ ██║██║  ███╗█████╗  ██║   ██║██╔██╗ ██║
██╔══██║██║   ██║██║╚██╗██║██║   ██║██╔══╝  ██║   ██║██║╚██╗██║
██║  ██║╚██████╔╝██║ ╚████║╚██████╔╝███████╗╚██████╔╝██║ ╚████║
╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝
Hardware ID Agent v2.0
)" << std::endl;
}

void printSuccess(const std::string& msg) {
    print(Color::BrightGreen, "[+] " + msg);
}

void printError(const std::string& msg) {
    print(Color::BrightRed, "[!] " + msg);
}

void printInfo(const std::string& msg) {
    print(Color::Cyan, "[*] " + msg);
}

Spinner::Spinner(const std::string& message) : message_(message), frame_(0), active_(true) {
    std::cout << "[*] " << message_ << " ";
    std::cout.flush();
}

Spinner::~Spinner() {
    if (active_) {
        std::cout << "\r";
        for (size_t i = 0; i < message_.length() + 7; i++) std::cout << " ";
        std::cout << "\r";
        std::cout.flush();
    }
}

void Spinner::spin() {
    if (!active_) return;
    const char* frames[] = {"\\", "|", "/", "-"};
    std::cout << "\b" << frames[frame_++ % 4] << std::flush;
}

void Spinner::done(const std::string& message) {
    active_ = false;
    std::cout << "\r";
    for (size_t i = 0; i < message_.length() + 7; i++) std::cout << " ";
    std::cout << "\r";
    printSuccess(message);
}

void Spinner::fail(const std::string& message) {
    active_ = false;
    std::cout << "\r";
    for (size_t i = 0; i < message_.length() + 7; i++) std::cout << " ";
    std::cout << "\r";
    printError(message);
}

void printDeviceInfo(const std::string& deviceName, const std::string& osName) {
    std::cout << "\n";
    print(Color::Yellow, "  ┌────────────────────────────────────────┐");
    print(Color::Yellow, "  │         YOUR MACHINE PROFILE           │");
    print(Color::Yellow, "  ├────────────────────────────────────────┤");
    std::cout << "  │  Computer: ";
    setColor(Color::White);
    std::cout << std::left << std::setw(28) << deviceName << "│" << std::endl;
    std::cout << "  │  OS:       ";
    setColor(Color::White);
    std::cout << std::left << std::setw(28) << osName << "│" << std::endl;
    print(Color::Yellow, "  └────────────────────────────────────────┘");
    std::cout << std::endl;
}

}
