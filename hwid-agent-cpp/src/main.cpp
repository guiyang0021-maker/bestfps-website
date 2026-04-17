#include <iostream>
#include <fstream>
#include <filesystem>
#include <string>
#include <vector>
#include <algorithm>
#include <stdexcept>
#include "console.h"
#include "json.h"
#include "hardware.h"
#include "network.h"
#include "crypto.h"

#ifdef _WIN32
#include <windows.h>
#include <shlobj.h>
#endif

namespace {

const std::string TOKEN_FILE_NAME = "bestfps-hwid-token.json";
const std::string AGENT_VERSION = "2.0.0";

std::string wideToUtf8(const std::wstring& value) {
    if (value.empty()) {
        return "";
    }

    int size = WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    if (size <= 0) {
        return "";
    }

    std::string result(size, '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.c_str(), static_cast<int>(value.size()), result.data(), size, nullptr, nullptr);
    return result;
}

// Search for token file in various locations
std::wstring findTokenFile() {
    std::vector<std::wstring> searchPaths;

    // Same directory as executable
    wchar_t exePath[MAX_PATH];
    if (GetModuleFileNameW(nullptr, exePath, MAX_PATH) > 0) {
        std::wstring dir = exePath;
        size_t pos = dir.find_last_of(L"\\/");
        if (pos != std::wstring::npos) {
            dir = dir.substr(0, pos);
            searchPaths.push_back(dir);
        }
    }

    // Downloads folder
    wchar_t downloads[MAX_PATH];
    if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_PROFILE, nullptr, 0, downloads))) {
        std::wstring downloadsDir = std::wstring(downloads) + L"\\Downloads";
        searchPaths.push_back(downloadsDir);
    }

    for (const auto& dir : searchPaths) {
        std::filesystem::path candidate = std::filesystem::path(dir) / TOKEN_FILE_NAME;
        std::ifstream file(candidate, std::ios::binary);
        if (file.good()) {
            return candidate.wstring();
        }
    }

    return L"";
}

// Read entire file into string
std::string readFile(const std::wstring& path) {
    std::ifstream file(std::filesystem::path(path), std::ios::binary);
    if (!file) return "";
    std::string content((std::istreambuf_iterator<char>(file)),
                        std::istreambuf_iterator<char>());
    return content;
}

bool deleteFile(const std::wstring& path) {
    return DeleteFileW(path.c_str()) != 0;
}

// Escape special characters for JSON string values
std::string jsonEscape(const std::string& s) {
    std::string result;
    result.reserve(s.size());
    for (char c : s) {
        switch (c) {
            case '"':  result += "\\\""; break;
            case '\\': result += "\\\\"; break;
            case '\b': result += "\\b";  break;
            case '\f': result += "\\f";  break;
            case '\n': result += "\\n";  break;
            case '\r': result += "\\r";  break;
            case '\t': result += "\\t";  break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    // Control characters: escape as \u00XX
                    char buf[7];
                    snprintf(buf, sizeof(buf), "\\u%04X", static_cast<unsigned char>(c));
                    result += buf;
                } else {
                    result += c;
                }
                break;
        }
    }
    return result;
}

// Build JSON payload for binding request
std::string buildPayload(const std::string& token,
                         const hardware::HardwareProfile& hw) {
    // JSON building with proper string escaping
    std::string json = "{";
    json += "\"token\":\"" + jsonEscape(token) + "\",";
    json += "\"hwid_hash\":\"" + jsonEscape(hw.hwid_hash) + "\",";
    json += "\"device_name\":\"" + jsonEscape(hw.device_name) + "\",";
    json += "\"os_name\":\"" + jsonEscape(hw.os_name) + "\",";
    json += "\"agent_version\":\"" + jsonEscape(hw.agent_version) + "\"";
    json += "}";
    return json;
}

}

int main() {
    console::enableColors();

    std::cout << "\n";
    console::printBanner();

    try {
        console::printInfo("Initializing BestFPS HWID Agent...");

        // 1. Find and read token file
        console::printInfo("Searching for token file...");
        std::wstring tokenPath = findTokenFile();

        if (tokenPath.empty()) {
            console::printError("Token file not found!");
            console::printInfo("Please run this from the same folder as 'bestfps-hwid-token.json'");
            console::printInfo("or keep the token file in your Downloads folder.");
            return 1;
        }

        console::printSuccess("Found token file: " + wideToUtf8(tokenPath));

        // 2. Parse token file
        std::string tokenContent = readFile(tokenPath);
        if (tokenContent.empty()) {
            console::printError("Failed to read token file");
            return 1;
        }

        json::Value tokenJson;
        try {
            tokenJson = json::parse(tokenContent);
        } catch (const std::exception& e) {
            console::printError(std::string("Failed to parse token file: ") + e.what());
            return 1;
        }

        const std::string* token = tokenJson.getString("token");
        const std::string* bindUrl = tokenJson.getString("bind_url");
        const std::string* accountId = tokenJson.getString("account_id");
        const double* accountIdNumber = tokenJson.getNumber("account_id");

        if (!token || !bindUrl) {
            console::printError("Token file is missing required fields (token, bind_url)");
            return 1;
        }

        std::string accountLabel = "unknown";
        if (accountId) {
            accountLabel = *accountId;
        } else if (accountIdNumber) {
            accountLabel = std::to_string(static_cast<long long>(*accountIdNumber));
        }
        console::printInfo("Token valid for account #" + accountLabel);

        // 3. Collect hardware info
        hardware::HardwareProfile hw = hardware::collect();

        // 4. Send binding request
        console::printInfo("Registering with server...");
        // Note: network::postJson already shows its own spinner internally

        std::string payload = buildPayload(*token, hw);
        network::Response resp = network::postJson(*bindUrl, payload,
                                                    "bestfps-hwid/" + AGENT_VERSION);

        if (!resp.success) {
            console::printError("Server rejected the binding");
            if (!resp.body.empty()) {
                try {
                    json::Value errorJson = json::parse(resp.body);
                    if (const std::string* error = errorJson.getString("error")) {
                        console::printError("Server response: " + *error);
                    } else if (const std::string* message = errorJson.getString("message")) {
                        console::printError("Server response: " + *message);
                    } else {
                        console::printError("Server response: " + resp.body);
                    }
                } catch (...) {
                    console::printError("Server response: " + resp.body);
                }
            }
            return 1;
        }

        console::printSuccess("Server accepted binding!");

        // Parse response message
        try {
            json::Value respJson = json::parse(resp.body);
            const std::string* message = respJson.getString("message");
            if (message) {
                console::printSuccess(*message);
            }
        } catch (...) {
            // Response body may not be valid JSON; ignore parse errors
        }

        // 5. Delete token file
        console::printInfo("Cleaning up...");
        if (deleteFile(tokenPath)) {
            console::printSuccess("Token file securely deleted");
        } else {
            console::printInfo("Note: Token file could not be deleted automatically");
            console::printInfo("(You can delete it manually - it's a one-time use token)");
        }

        // 6. Final success
        std::cout << "\n";
        console::print(console::Color::BrightGreen, R"(
    ╔═══════════════════════════════════════════╗
    ║                                           ║
    ║   HWID BINDING COMPLETED SUCCESSFULLY!    ║
    ║                                           ║
    ║   Your device is now linked to BestFPS    ║
    ║                                           ║
    ╚═══════════════════════════════════════════╝
)");
        std::cout << "\n";
        return 0;

    } catch (const std::exception& e) {
        console::printError(std::string("Error: ") + e.what());
        console::printInfo("Please try again or contact support if the problem persists.");
        return 1;
    } catch (...) {
        console::printError("An unexpected error occurred");
        return 1;
    }

    return 0;
}
