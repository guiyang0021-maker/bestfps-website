#pragma once
#include <string>

namespace hardware {

struct HardwareProfile {
    std::string hwid_hash;      // SHA-256 hash of all identifiers
    std::string device_name;     // Computer name
    std::string os_name;        // OS version string
    std::string agent_version;  // This agent version
};

// Collect hardware identifiers and generate HWID hash
HardwareProfile collect();

}
