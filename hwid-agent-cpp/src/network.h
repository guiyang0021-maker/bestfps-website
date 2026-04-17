#pragma once
#include <string>
#include <map>

namespace network {

struct Response {
    int status_code = 0;
    std::string body;
    std::string error;
    bool success = false;
};

// HTTP POST request with JSON body.
// Returns a Response with:
//   - success=true and body populated if status code is 2xx
//   - success=false with error message if request failed
//   - success=false with body containing error details otherwise
Response postJson(const std::string& url, const std::string& jsonBody, const std::string& userAgent);

}
