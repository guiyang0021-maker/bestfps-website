#include "hardware.h"
#include "console.h"
#include "crypto.h"
#include <windows.h>
#include <wbemidl.h>
#include <comdef.h>
#include <intrin.h>
#include <algorithm>
#include <cctype>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

std::string trim(std::string value) {
    auto notSpace = [](unsigned char ch) { return !std::isspace(ch); };
    value.erase(value.begin(), std::find_if(value.begin(), value.end(), notSpace));
    value.erase(std::find_if(value.rbegin(), value.rend(), notSpace).base(), value.end());
    return value;
}

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

std::string readRegistryString(HKEY hKey, const wchar_t* subKey, const wchar_t* valueName) {
    HKEY hResult = nullptr;
    if (RegOpenKeyExW(hKey, subKey, 0, KEY_READ | KEY_WOW64_64KEY, &hResult) != ERROR_SUCCESS) {
        return "";
    }

    DWORD type = 0;
    DWORD bufferSize = 0;
    LONG status = RegQueryValueExW(hResult, valueName, nullptr, &type, nullptr, &bufferSize);
    if (status != ERROR_SUCCESS || (type != REG_SZ && type != REG_EXPAND_SZ) || bufferSize < sizeof(wchar_t)) {
        RegCloseKey(hResult);
        return "";
    }

    std::vector<wchar_t> buffer((bufferSize / sizeof(wchar_t)) + 1, L'\0');
    status = RegQueryValueExW(
        hResult,
        valueName,
        nullptr,
        &type,
        reinterpret_cast<BYTE*>(buffer.data()),
        &bufferSize
    );
    RegCloseKey(hResult);
    if (status != ERROR_SUCCESS) {
        return "";
    }

    return trim(wideToUtf8(std::wstring(buffer.data())));
}

class ComScope {
public:
    ComScope() {
        HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
        if (hr == S_OK || hr == S_FALSE) {
            shouldUninitialize_ = true;
            ready_ = true;
        } else if (hr == RPC_E_CHANGED_MODE) {
            ready_ = true;
        }

        if (!ready_) {
            return;
        }

        hr = CoInitializeSecurity(
            nullptr,
            -1,
            nullptr,
            nullptr,
            RPC_C_AUTHN_LEVEL_DEFAULT,
            RPC_C_IMP_LEVEL_IMPERSONATE,
            nullptr,
            EOAC_NONE,
            nullptr
        );

        if (FAILED(hr) && hr != RPC_E_TOO_LATE) {
            ready_ = false;
        }
    }

    ~ComScope() {
        if (shouldUninitialize_) {
            CoUninitialize();
        }
    }

    bool ready() const {
        return ready_;
    }

private:
    bool ready_ = false;
    bool shouldUninitialize_ = false;
};

std::string variantToUtf8(const VARIANT& value) {
    VARIANT converted;
    VariantInit(&converted);

    const VARIANT* source = &value;
    if (value.vt != VT_BSTR) {
        if (FAILED(VariantChangeType(&converted, const_cast<VARIANT*>(&value), 0, VT_BSTR))) {
            return "";
        }
        source = &converted;
    }

    std::string result;
    if (source->vt == VT_BSTR && source->bstrVal) {
        result = wideToUtf8(std::wstring(source->bstrVal, SysStringLen(source->bstrVal)));
    }

    if (source == &converted) {
        VariantClear(&converted);
    }
    return trim(result);
}

std::string queryWmiProperty(const wchar_t* className, const wchar_t* propertyName) {
    ComScope com;
    if (!com.ready()) {
        return "";
    }

    IWbemLocator* locator = nullptr;
    IWbemServices* services = nullptr;
    IEnumWbemClassObject* enumerator = nullptr;
    std::string result;

    HRESULT hr = CoCreateInstance(
        CLSID_WbemLocator,
        nullptr,
        CLSCTX_INPROC_SERVER,
        IID_IWbemLocator,
        reinterpret_cast<void**>(&locator)
    );
    if (FAILED(hr)) {
        return "";
    }

    hr = locator->ConnectServer(
        _bstr_t(L"ROOT\\CIMV2"),
        nullptr,
        nullptr,
        nullptr,
        0,
        nullptr,
        nullptr,
        &services
    );
    if (FAILED(hr)) {
        locator->Release();
        return "";
    }

    hr = CoSetProxyBlanket(
        services,
        RPC_C_AUTHN_WINNT,
        RPC_C_AUTHZ_NONE,
        nullptr,
        RPC_C_AUTHN_LEVEL_CALL,
        RPC_C_IMP_LEVEL_IMPERSONATE,
        nullptr,
        EOAC_NONE
    );
    if (FAILED(hr)) {
        services->Release();
        locator->Release();
        return "";
    }

    std::wstring query = L"SELECT ";
    query += propertyName;
    query += L" FROM ";
    query += className;

    hr = services->ExecQuery(
        bstr_t(L"WQL"),
        bstr_t(query.c_str()),
        WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
        nullptr,
        &enumerator
    );
    if (FAILED(hr)) {
        services->Release();
        locator->Release();
        return "";
    }

    IWbemClassObject* obj = nullptr;
    ULONG returned = 0;
    hr = enumerator->Next(5000, 1, &obj, &returned);
    if (SUCCEEDED(hr) && returned == 1 && obj) {
        VARIANT value;
        VariantInit(&value);
        if (SUCCEEDED(obj->Get(propertyName, 0, &value, nullptr, nullptr))) {
            result = variantToUtf8(value);
        }
        VariantClear(&value);
        obj->Release();
    }

    enumerator->Release();
    services->Release();
    locator->Release();
    return result;
}

std::string getComputerNameUtf8() {
    DWORD size = MAX_COMPUTERNAME_LENGTH + 1;
    std::vector<wchar_t> buffer(size, L'\0');
    if (!GetComputerNameW(buffer.data(), &size)) {
        return "";
    }
    return trim(wideToUtf8(std::wstring(buffer.data(), size)));
}

std::string getOsName() {
    const wchar_t* currentVersionKey = L"SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion";
    std::string productName = readRegistryString(HKEY_LOCAL_MACHINE, currentVersionKey, L"ProductName");
    std::string displayVersion = readRegistryString(HKEY_LOCAL_MACHINE, currentVersionKey, L"DisplayVersion");
    std::string releaseId = readRegistryString(HKEY_LOCAL_MACHINE, currentVersionKey, L"ReleaseId");
    std::string buildNumber = readRegistryString(HKEY_LOCAL_MACHINE, currentVersionKey, L"CurrentBuildNumber");

    std::string result = productName.empty() ? "Windows" : productName;
    if (!displayVersion.empty()) {
        result += " " + displayVersion;
    } else if (!releaseId.empty()) {
        result += " " + releaseId;
    }
    if (!buildNumber.empty()) {
        result += " (Build " + buildNumber + ")";
    }
    return trim(result);
}

}

namespace hardware {

HardwareProfile collect() {
    HardwareProfile profile;
    profile.agent_version = "2.0.0";

    console::Spinner spinner("Scanning hardware fingerprint");

    std::string machineGuid = readRegistryString(
        HKEY_LOCAL_MACHINE,
        L"SOFTWARE\\Microsoft\\Cryptography",
        L"MachineGuid"
    );
    spinner.spin();

    std::string biosSerial = queryWmiProperty(L"Win32_BIOS", L"SerialNumber");
    spinner.spin();

    std::string boardSerial = queryWmiProperty(L"Win32_BaseBoard", L"SerialNumber");
    spinner.spin();

    std::string cpuId = queryWmiProperty(L"Win32_Processor", L"ProcessorId");
    if (cpuId.empty()) {
        int cpuInfo[4] = {};
        __cpuid(cpuInfo, 1);
        char buffer[33];
        sprintf_s(
            buffer,
            sizeof(buffer),
            "%08X%08X%08X%08X",
            static_cast<unsigned int>(cpuInfo[0]),
            static_cast<unsigned int>(cpuInfo[1]),
            static_cast<unsigned int>(cpuInfo[2]),
            static_cast<unsigned int>(cpuInfo[3])
        );
        cpuId = buffer;
    }
    spinner.spin();

    profile.device_name = getComputerNameUtf8();
    profile.os_name = getOsName();

    std::vector<std::string> parts;
    if (!machineGuid.empty()) parts.push_back(machineGuid);
    if (!biosSerial.empty()) parts.push_back(biosSerial);
    if (!boardSerial.empty()) parts.push_back(boardSerial);
    if (!cpuId.empty()) parts.push_back(cpuId);
    if (!profile.device_name.empty()) parts.push_back(profile.device_name);

    if (parts.empty()) {
        spinner.fail("Hardware fingerprint failed");
        throw std::runtime_error("No usable hardware identifiers found");
    }

    std::string hwidSource;
    for (size_t i = 0; i < parts.size(); i++) {
        if (i > 0) {
            hwidSource += "|";
        }
        hwidSource += parts[i];
    }

    profile.hwid_hash = crypto::sha256(hwidSource);
    crypto::secureZero(hwidSource.data(), hwidSource.size());

    if (profile.hwid_hash.empty()) {
        spinner.fail("Hardware fingerprint failed");
        throw std::runtime_error("Failed to hash hardware identifiers");
    }

    spinner.done("Hardware fingerprint collected");
    console::printDeviceInfo(profile.device_name, profile.os_name);
    return profile;
}

}
