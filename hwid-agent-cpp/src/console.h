#pragma once
#include <string>

namespace console {

// ANSI color codes for Windows 10+
enum class Color {
    Reset = 0,
    Bold = 1,
    Red = 31,
    Green = 32,
    Yellow = 33,
    Blue = 34,
    Magenta = 35,
    Cyan = 36,
    White = 37,
    Gray = 90,
    BrightRed = 91,
    BrightGreen = 92,
    BrightYellow = 93,
};

// Enable ANSI colors on Windows
void enableColors();

// Set text color
void setColor(Color color);

// Reset to default
void resetColor();

// Print with color
void print(Color color, const std::string& msg);

// Print ASCII art banner
void printBanner();

// Print success message with checkmark
void printSuccess(const std::string& msg);

// Print error message
void printError(const std::string& msg);

// Print info message
void printInfo(const std::string& msg);

// Spinner animation for loading states
class Spinner {
public:
    Spinner(const std::string& message);
    ~Spinner();
    void spin();
    void done(const std::string& message);
    void fail(const std::string& message);
private:
    std::string message_;
    size_t frame_ = 0;
    bool active_ = false;
};

// Print device info table
void printDeviceInfo(const std::string& deviceName, const std::string& osName);

}
