#include <napi.h>
#import "SwiftBridge.h"

// --- Audio Recording ---------------------------------------------------

static Napi::ThreadSafeFunction levelTsfn;
static Napi::ThreadSafeFunction errorTsfn;
static bool recordingActive = false;

Napi::Value SpeechRequestAuth(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Function callback = info[0].As<Napi::Function>();

    auto tsfn = Napi::ThreadSafeFunction::New(env, callback, "AuthCallback", 0, 1);

    [SpeechBridge requestAuthorization:^(BOOL granted) {
        tsfn.NonBlockingCall([granted](Napi::Env env, Napi::Function jsCallback) {
            jsCallback.Call({Napi::Boolean::New(env, granted)});
        });
        tsfn.Release();
    }];

    return env.Undefined();
}

Napi::Value SpeechIsAvailable(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), [SpeechBridge isAvailable]);
}

Napi::Value RecordStart(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    Napi::Function onLevel = info[0].As<Napi::Function>();
    Napi::Function onError = info[1].As<Napi::Function>();

    levelTsfn = Napi::ThreadSafeFunction::New(env, onLevel, "AudioLevel", 0, 1);
    errorTsfn = Napi::ThreadSafeFunction::New(env, onError, "Error", 0, 1);
    recordingActive = true;

    [SpeechBridge startRecognitionWithLocale:@"en-US"
        onPartialResult:^(NSString *text) {
            // Not used with Whisper
        }
        onFinalResult:^(NSString *text) {
            // Not used with Whisper
        }
        onAudioLevel:^(float level) {
            if (!recordingActive) return;
            levelTsfn.NonBlockingCall([level](Napi::Env env, Napi::Function cb) {
                cb.Call({Napi::Number::New(env, level)});
            });
        }
        onError:^(NSString *error) {
            if (!recordingActive) return;
            std::string cppError = [error UTF8String];
            errorTsfn.NonBlockingCall([cppError](Napi::Env env, Napi::Function cb) {
                cb.Call({Napi::String::New(env, cppError)});
            });
        }
    ];

    return env.Undefined();
}

Napi::Value RecordStop(const Napi::CallbackInfo& info) {
    if (!recordingActive) {
        return info.Env().Null();
    }

    recordingActive = false;

    // Stop recording and get WAV file path
    NSString *wavPath = [SpeechBridge stopAndSaveRecording];

    // Release TSFNs
    if (levelTsfn) levelTsfn.Release();
    if (errorTsfn) errorTsfn.Release();

    if (wavPath) {
        return Napi::String::New(info.Env(), [wavPath UTF8String]);
    }
    return info.Env().Null();
}

Napi::Value SpeechStop(const Napi::CallbackInfo& info) {
    if (!recordingActive) {
        return info.Env().Undefined();
    }
    recordingActive = false;
    [SpeechBridge stopRecognition];
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

    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        [KeyboardBridge typeText:nsText delayMs:delay];
    });

    return info.Env().Undefined();
}

Napi::Value KeyboardPaste(const Napi::CallbackInfo& info) {
    [KeyboardBridge pasteFromClipboard];
    return info.Env().Undefined();
}

Napi::Value KeyboardCheckPermission(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), [KeyboardBridge checkAccessibilityPermission]);
}

Napi::Value KeyboardRequestPermission(const Napi::CallbackInfo& info) {
    [KeyboardBridge requestAccessibilityPermission];
    return info.Env().Undefined();
}

// --- Audio Input Device Selection --------------------------------------

Napi::Value ListAudioInputDevices(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    NSArray<NSDictionary *> *devices = [SpeechBridge listAudioInputDevices];

    Napi::Array result = Napi::Array::New(env, devices.count);
    for (NSUInteger i = 0; i < devices.count; i++) {
        NSDictionary *device = devices[i];
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("uid", Napi::String::New(env, [device[@"uid"] UTF8String]));
        obj.Set("name", Napi::String::New(env, [device[@"name"] UTF8String]));
        result.Set(i, obj);
    }
    return result;
}

Napi::Value SetAudioInputDevice(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::string uid = info[0].As<Napi::String>().Utf8Value();
    NSString *nsUid = [NSString stringWithUTF8String:uid.c_str()];
    BOOL ok = [SpeechBridge setAudioInputDeviceUID:nsUid];
    return Napi::Boolean::New(env, ok);
}

Napi::Value ClearAudioInputDevice(const Napi::CallbackInfo& info) {
    [SpeechBridge clearAudioInputDevice];
    return info.Env().Undefined();
}

// --- Module Registration -----------------------------------------------

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Audio recording
    exports.Set("speechRequestAuth", Napi::Function::New(env, SpeechRequestAuth));
    exports.Set("speechIsAvailable", Napi::Function::New(env, SpeechIsAvailable));
    exports.Set("recordStart", Napi::Function::New(env, RecordStart));
    exports.Set("recordStop", Napi::Function::New(env, RecordStop));
    exports.Set("speechStop", Napi::Function::New(env, SpeechStop));

    // Hotkey
    exports.Set("hotkeyStart", Napi::Function::New(env, HotkeyStart));
    exports.Set("hotkeyStop", Napi::Function::New(env, HotkeyStop));

    // Audio input device
    exports.Set("listAudioInputDevices", Napi::Function::New(env, ListAudioInputDevices));
    exports.Set("setAudioInputDevice", Napi::Function::New(env, SetAudioInputDevice));
    exports.Set("clearAudioInputDevice", Napi::Function::New(env, ClearAudioInputDevice));

    // Keyboard
    exports.Set("keyboardType", Napi::Function::New(env, KeyboardType));
    exports.Set("keyboardPaste", Napi::Function::New(env, KeyboardPaste));
    exports.Set("keyboardCheckPermission", Napi::Function::New(env, KeyboardCheckPermission));
    exports.Set("keyboardRequestPermission", Napi::Function::New(env, KeyboardRequestPermission));

    return exports;
}

NODE_API_MODULE(myvoice_native, Init)
