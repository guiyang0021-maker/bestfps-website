#include "json.h"
#include <cctype>
#include <cstdlib>
#include <stdexcept>

namespace json {

static void skipWhitespace(const std::string& s, size_t& i) {
    while (i < s.size() && std::isspace(static_cast<unsigned char>(s[i]))) {
        i++;
    }
}

static void expectChar(const std::string& s, size_t& i, char expected) {
    if (i >= s.size() || s[i] != expected) {
        throw std::runtime_error("Invalid JSON");
    }
    i++;
}

static void parseString(const std::string& s, size_t& i, std::string& result) {
    expectChar(s, i, '"');
    result.clear();

    while (i < s.size()) {
        char ch = s[i++];
        if (ch == '"') {
            return;
        }
        if (ch == '\\') {
            if (i >= s.size()) {
                throw std::runtime_error("Invalid JSON escape");
            }

            char escaped = s[i++];
            switch (escaped) {
                case '"': result += '"'; break;
                case '\\': result += '\\'; break;
                case '/': result += '/'; break;
                case 'b': result += '\b'; break;
                case 'f': result += '\f'; break;
                case 'n': result += '\n'; break;
                case 'r': result += '\r'; break;
                case 't': result += '\t'; break;
                default:
                    throw std::runtime_error("Unsupported JSON escape");
            }
            continue;
        }

        result += ch;
    }

    throw std::runtime_error("Unterminated JSON string");
}

static Value parseValue(const std::string& s, size_t& i) {
    skipWhitespace(s, i);
    if (i >= s.size()) {
        throw std::runtime_error("Unexpected end of JSON");
    }

    if (s[i] == '"') {
        std::string str;
        parseString(s, i, str);
        Value v;
        v.type_ = Value::Type::String;
        v.strValue_ = str;
        return v;
    }

    if (s[i] == '{') {
        Value v;
        v.type_ = Value::Type::Object;
        i++;
        skipWhitespace(s, i);

        if (i < s.size() && s[i] == '}') {
            i++;
            return v;
        }

        while (i < s.size()) {
            std::string key;
            parseString(s, i, key);
            skipWhitespace(s, i);
            expectChar(s, i, ':');
            v.objectValue_[key] = parseValue(s, i);
            skipWhitespace(s, i);

            if (i < s.size() && s[i] == ',') {
                i++;
                skipWhitespace(s, i);
                continue;
            }

            expectChar(s, i, '}');
            return v;
        }

        throw std::runtime_error("Unterminated JSON object");
    }

    if (s.compare(i, 4, "true") == 0) {
        Value v;
        v.type_ = Value::Type::Bool;
        v.boolValue_ = true;
        i += 4;
        return v;
    }

    if (s.compare(i, 5, "false") == 0) {
        Value v;
        v.type_ = Value::Type::Bool;
        v.boolValue_ = false;
        i += 5;
        return v;
    }

    if (s.compare(i, 4, "null") == 0) {
        i += 4;
        return Value();
    }

    size_t start = i;
    if (s[i] == '-') {
        i++;
    }
    bool hasDigit = false;
    while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) {
        hasDigit = true;
        i++;
    }
    if (i < s.size() && s[i] == '.') {
        i++;
        while (i < s.size() && std::isdigit(static_cast<unsigned char>(s[i]))) {
            hasDigit = true;
            i++;
        }
    }
    if (!hasDigit) {
        throw std::runtime_error("Invalid JSON number");
    }

    Value v;
    v.type_ = Value::Type::Number;
    v.numValue_ = std::strtod(s.c_str() + start, nullptr);
    return v;
}

Value parse(const std::string& jsonStr) {
    size_t i = 0;
    Value value = parseValue(jsonStr, i);
    skipWhitespace(jsonStr, i);
    if (i != jsonStr.size()) {
        throw std::runtime_error("Trailing data after JSON value");
    }
    return value;
}

const std::string* Value::getString(const std::string& key) const {
    auto it = objectValue_.find(key);
    if (it != objectValue_.end() && it->second.isString()) {
        return &it->second.strValue_;
    }
    return nullptr;
}

const double* Value::getNumber(const std::string& key) const {
    auto it = objectValue_.find(key);
    if (it != objectValue_.end() && it->second.isNumber()) {
        return &it->second.numValue_;
    }
    return nullptr;
}

const Value* Value::getObject(const std::string& key) const {
    auto it = objectValue_.find(key);
    if (it != objectValue_.end() && it->second.isObject()) {
        return &it->second;
    }
    return nullptr;
}

bool Value::hasKey(const std::string& key) const {
    return objectValue_.find(key) != objectValue_.end();
}

}
