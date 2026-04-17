#include "network.h"
#include "console.h"
#include <windows.h>
#include <winhttp.h>
#include <cstring>

#pragma comment(lib, "winhttp.lib")

namespace network {

static std::wstring toWideString(const std::string& str) {
    if (str.empty()) return std::wstring();
    int size = MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, nullptr, 0);
    std::wstring result(size - 1, 0);
    MultiByteToWideChar(CP_UTF8, 0, str.c_str(), -1, &result[0], size);
    return result;
}

Response postJson(const std::string& url, const std::string& jsonBody, const std::string& userAgent) {
    Response response;

    // Parse URL
    URL_COMPONENTSW urlComp = {};
    urlComp.dwStructSize = sizeof(urlComp);
    wchar_t scheme[16] = {};
    wchar_t host[256] = {};
    wchar_t path[1024] = {};
    urlComp.lpszScheme = scheme;
    urlComp.dwSchemeLength = 16;
    urlComp.lpszHostName = host;
    urlComp.dwHostNameLength = 256;
    urlComp.lpszUrlPath = path;
    urlComp.dwUrlPathLength = 1024;

    std::wstring wideUrl = toWideString(url);
    if (!WinHttpCrackUrl(wideUrl.c_str(), 0, 0, &urlComp)) {
        response.error = "Failed to parse URL";
        return response;
    }

    if (urlComp.nScheme != INTERNET_SCHEME_HTTP && urlComp.nScheme != INTERNET_SCHEME_HTTPS) {
        response.error = "Unsupported URL scheme";
        return response;
    }

    console::Spinner spinner("Connecting to server");

    // Open WinHTTP session
    HINTERNET hSession = WinHttpOpen(
        toWideString(userAgent).c_str(),
        WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0
    );

    if (!hSession) {
        spinner.fail("Connection failed");
        response.error = "Failed to open HTTP session";
        return response;
    }
    spinner.spin();

    // Connect
    HINTERNET hConnect = WinHttpConnect(
        hSession,
        host,
        urlComp.nPort,
        0
    );

    if (!hConnect) {
        WinHttpCloseHandle(hSession);
        spinner.fail("Connection failed");
        response.error = "Failed to connect to server";
        return response;
    }
    spinner.spin();

    // Open request
    HINTERNET hRequest = WinHttpOpenRequest(
        hConnect,
        L"POST",
        path,
        nullptr,
        WINHTTP_NO_REFERER,
        WINHTTP_ACCEPT_TYPES,
        urlComp.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0
    );

    if (!hRequest) {
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        spinner.fail("Request failed");
        response.error = "Failed to open request";
        return response;
    }

    // Set headers
    std::wstring contentType = L"Content-Type: application/json";
    // Keep default certificate validation enabled and use explicit request timeouts.
    WinHttpSetTimeouts(hRequest, 30000, 30000, 30000, 30000);

    if (!WinHttpSendRequest(hRequest, contentType.c_str(), contentType.length(),
                           jsonBody.c_str(), jsonBody.length(), jsonBody.length(), 0)) {
        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        spinner.fail("Request failed");
        response.error = "Failed to send request";
        return response;
    }

    spinner.spin();

    // Receive response
    DWORD statusCode = 0;
    DWORD statusCodeSize = sizeof(statusCode);

    if (!WinHttpReceiveResponse(hRequest, nullptr)) {
        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        spinner.fail("Response failed");
        response.error = "Failed to receive response";
        return response;
    }

    WinHttpQueryHeaders(hRequest, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                       WINHTTP_HEADER_NAME_BY_INDEX, &statusCode, &statusCodeSize, WINHTTP_NO_HEADER_INDEX);

    response.status_code = static_cast<int>(statusCode);
    spinner.spin();

    // Read response body
    std::string body;
    DWORD bytesRead = 0;
    char buffer[4096];

    while (true) {
        if (!WinHttpReadData(hRequest, buffer, sizeof(buffer), &bytesRead)) {
            // Read failed - log error but continue with what we have
            break;
        }
        if (bytesRead == 0) {
            break;
        }
        body.append(buffer, bytesRead);
    }

    response.body = body;
    response.success = (statusCode >= 200 && statusCode < 300);

    if (response.success) {
        spinner.done("Connected successfully");
    } else {
        spinner.fail("Request failed");
    }

    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);

    return response;
}

}
