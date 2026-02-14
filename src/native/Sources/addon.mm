#include <napi.h>
#import "SwiftBridge.h"

// --- Speech Recognition ------------------------------------------------

static Napi::ThreadSafeFunction partialTsfn;
static Napi::ThreadSafeFunction finalTsfn;
static Napi::ThreadSafeFunction levelTsfn;
static Napi::ThreadSafeFunction errorTsfn;

Napi::Value SpeechRequestAuth(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Function callback = info[0].As<Napi::Function>();

    auto tsfn = Napi::ThreadSafeFunction::New(env, callback, "AuthCallback", 0, 1);

    [SpeechBridge requestAuthorization:^(BOOL granted) {
        tsfn.BlockingCall([granted](Napi::Env env, Napi::Function jsCallback) {
            jsCallback.Call({Napi::Boolean::New(env, granted)});
        });
        tsfn.Release();
    }];

    return env.Undefined();
}

Napi::Value SpeechIsAvailable(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), [SpeechBridge isAvailable]);
}

Napi::Value SpeechStart(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    std::string locale = info[0].As<Napi::String>().Utf8Value();
    Napi::Function onPartial = info[1].As<Napi::Function>();
    Napi::Function onFinal = info[2].As<Napi::Function>();
    Napi::Function onLevel = info[3].As<Napi::Function>();
    Napi::Function onError = info[4].As<Napi::Function>();

    partialTsfn = Napi::ThreadSafeFunction::New(env, onPartial, "PartialResult", 0, 1);
    finalTsfn = Napi::ThreadSafeFunction::New(env, onFinal, "FinalResult", 0, 1);
    levelTsfn = Napi::ThreadSafeFunction::New(env, onLevel, "AudioLevel", 0, 1);
    errorTsfn = Napi::ThreadSafeFunction::New(env, onError, "Error", 0, 1);

    NSString *nsLocale = [NSString stringWithUTF8String:locale.c_str()];

    [SpeechBridge startRecognitionWithLocale:nsLocale
        onPartialResult:^(NSString *text) {
            std::string cppText = [text UTF8String];
            partialTsfn.NonBlockingCall([cppText](Napi::Env env, Napi::Function cb) {
                cb.Call({Napi::String::New(env, cppText)});
            });
        }
        onFinalResult:^(NSString *text) {
            std::string cppText = [text UTF8String];
            finalTsfn.NonBlockingCall([cppText](Napi::Env env, Napi::Function cb) {
                cb.Call({Napi::String::New(env, cppText)});
            });
        }
        onAudioLevel:^(float level) {
            levelTsfn.NonBlockingCall([level](Napi::Env env, Napi::Function cb) {
                cb.Call({Napi::Number::New(env, level)});
            });
        }
        onError:^(NSString *error) {
            std::string cppError = [error UTF8String];
            errorTsfn.NonBlockingCall([cppError](Napi::Env env, Napi::Function cb) {
                cb.Call({Napi::String::New(env, cppError)});
            });
        }
    ];

    return env.Undefined();
}

Napi::Value SpeechStop(const Napi::CallbackInfo& info) {
    [SpeechBridge stopRecognition];

    // Release thread-safe functions
    if (partialTsfn) partialTsfn.Release();
    if (finalTsfn) finalTsfn.Release();
    if (levelTsfn) levelTsfn.Release();
    if (errorTsfn) errorTsfn.Release();

    return info.Env().Undefined();
}

// --- Hotkey Detection --------------------------------------------------

static Napi::ThreadSafeFunction hotkeyTsfn;

Napi::Value HotkeyStart(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Function callback = info[0].As<Napi::Function>();

    hotkeyTsfn = Napi::ThreadSafeFunction::New(env, callback, "HotkeyCallback", 0, 1);

    [HotkeyBridge startMonitoringWithCallback:^{
        hotkeyTsfn.NonBlockingCall([](Napi::Env env, Napi::Function cb) {
            cb.Call({});
        });
    }];

    return env.Undefined();
}

Napi::Value HotkeyStop(const Napi::CallbackInfo& info) {
    [HotkeyBridge stopMonitoring];
    if (hotkeyTsfn) hotkeyTsfn.Release();
    return info.Env().Undefined();
}

// --- Keyboard Simulation -----------------------------------------------

Napi::Value KeyboardType(const Napi::CallbackInfo& info) {
    std::string text = info[0].As<Napi::String>().Utf8Value();
    int delay = info.Length() > 1 ? info[1].As<Napi::Number>().Int32Value() : 10;

    NSString *nsText = [NSString stringWithUTF8String:text.c_str()];

    // Run on background thread to avoid blocking Node event loop
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        [KeyboardBridge typeText:nsText delayMs:delay];
    });

    return info.Env().Undefined();
}

Napi::Value KeyboardCheckPermission(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), [KeyboardBridge checkAccessibilityPermission]);
}

Napi::Value KeyboardRequestPermission(const Napi::CallbackInfo& info) {
    [KeyboardBridge requestAccessibilityPermission];
    return info.Env().Undefined();
}

// --- Module Registration -----------------------------------------------

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Speech
    exports.Set("speechRequestAuth", Napi::Function::New(env, SpeechRequestAuth));
    exports.Set("speechIsAvailable", Napi::Function::New(env, SpeechIsAvailable));
    exports.Set("speechStart", Napi::Function::New(env, SpeechStart));
    exports.Set("speechStop", Napi::Function::New(env, SpeechStop));

    // Hotkey
    exports.Set("hotkeyStart", Napi::Function::New(env, HotkeyStart));
    exports.Set("hotkeyStop", Napi::Function::New(env, HotkeyStop));

    // Keyboard
    exports.Set("keyboardType", Napi::Function::New(env, KeyboardType));
    exports.Set("keyboardCheckPermission", Napi::Function::New(env, KeyboardCheckPermission));
    exports.Set("keyboardRequestPermission", Napi::Function::New(env, KeyboardRequestPermission));

    return exports;
}

NODE_API_MODULE(myvoice_native, Init)
