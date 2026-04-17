#pragma once
#include <string>

namespace crypto {

// Compute SHA-256 hash of input string
// Returns lowercase hex string (64 characters)
std::string sha256(const std::string& input);

// Securely zero memory (prevents compiler from optimizing away)
void secureZero(void* ptr, size_t len);

}
