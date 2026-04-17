#pragma once
#include <string>
#include <map>

namespace json {

// Minimal JSON value class for parsing token files
class Value {
public:
    enum class Type { Null, String, Number, Object, Array, Bool };

    Value() : type_(Type::Null) {}

    Type type() const { return type_; }

    bool isString() const { return type_ == Type::String; }
    bool isNumber() const { return type_ == Type::Number; }
    bool isObject() const { return type_ == Type::Object; }
    bool isBool() const { return type_ == Type::Bool; }
    bool isNull() const { return type_ == Type::Null; }

    const std::string& asString() const { return strValue_; }
    double asNumber() const { return numValue_; }
    bool asBool() const { return boolValue_; }

    const std::string* getString(const std::string& key) const;
    const double* getNumber(const std::string& key) const;
    const Value* getObject(const std::string& key) const;
    bool hasKey(const std::string& key) const;

    using const_iterator = std::map<std::string, Value>::const_iterator;
    const_iterator begin() const { return objectValue_.begin(); }
    const_iterator end() const { return objectValue_.end(); }

private:
    friend Value parse(const std::string& json);
    Type type_;
    std::string strValue_;
    double numValue_ = 0;
    bool boolValue_ = false;
    std::map<std::string, Value> objectValue_;
};

// Parse JSON string into Value
Value parse(const std::string& json);

// Get string from object, returns nullptr if not found
inline const std::string* ObjectGetString(const Value& obj, const std::string& key) {
    return obj.getString(key);
}

}
