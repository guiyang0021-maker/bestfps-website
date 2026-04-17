#include "crypto.h"
#include <windows.h>
#include <wincrypt.h>
#include <cstring>
#include <vector>

#pragma comment(lib, "crypt32.lib")

namespace crypto {

std::string sha256(const std::string& input) {
    HCRYPTPROV hProv = 0;
    HCRYPTHASH hHash = 0;
    std::string result;

    // Acquire crypto context
    if (!CryptAcquireContext(&hProv, nullptr, nullptr, PROV_RSA_AES, CRYPT_VERIFYCONTEXT)) {
        return "";
    }

    // Create hash object
    if (!CryptCreateHash(hProv, CALG_SHA_256, 0, 0, &hHash)) {
        CryptReleaseContext(hProv, 0);
        return "";
    }

    // Hash the data
    if (!CryptHashData(hHash, reinterpret_cast<const BYTE*>(input.data()),
                       static_cast<DWORD>(input.size()), 0)) {
        CryptDestroyHash(hHash);
        CryptReleaseContext(hProv, 0);
        return "";
    }

    // Get hash size
    DWORD hashSize = 0;
    DWORD paramSize = sizeof(DWORD);
    if (!CryptGetHashParam(hHash, HP_HASHSIZE, reinterpret_cast<BYTE*>(&hashSize), &paramSize, 0)) {
        CryptDestroyHash(hHash);
        CryptReleaseContext(hProv, 0);
        return "";
    }

    // Get hash value
    std::vector<BYTE> hashBuffer(hashSize);
    if (!CryptGetHashParam(hHash, HP_HASHVAL, hashBuffer.data(), &hashSize, 0)) {
        CryptDestroyHash(hHash);
        CryptReleaseContext(hProv, 0);
        return "";
    }

    // Convert to hex string
    result.reserve(hashSize * 2);
    for (DWORD i = 0; i < hashSize; i++) {
        char buf[3];
        sprintf(buf, "%02x", hashBuffer[i]);
        result += buf;
    }

    // Cleanup
    CryptDestroyHash(hHash);
    CryptReleaseContext(hProv, 0);

    // Securely clear hash from memory
    std::fill(hashBuffer.begin(), hashBuffer.end(), 0);

    return result;
}

void secureZero(void* ptr, size_t len) {
    // Use volatile pointer to prevent compiler optimization
    volatile unsigned char* p = static_cast<volatile unsigned char*>(ptr);
    while (len--) {
        *p++ = 0;
    }
}

}
