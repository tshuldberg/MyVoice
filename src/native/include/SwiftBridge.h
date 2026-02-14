#import <Foundation/Foundation.h>

// Speech recognition bridge
@interface SpeechBridge : NSObject
+ (void)requestAuthorization:(void (^)(BOOL granted))callback;
+ (BOOL)isAvailable;
+ (void)startRecognitionWithLocale:(NSString *)locale
                   onPartialResult:(void (^)(NSString *text))partialCallback
                     onFinalResult:(void (^)(NSString *text))finalCallback
                      onAudioLevel:(void (^)(float level))levelCallback
                           onError:(void (^)(NSString *error))errorCallback;
+ (void)stopRecognition;
@end

// Hotkey (fn double-tap) bridge
@interface HotkeyBridge : NSObject
+ (void)startMonitoringWithCallback:(void (^)(void))doubleTapCallback;
+ (void)stopMonitoring;
@end

// Keyboard simulation bridge
@interface KeyboardBridge : NSObject
+ (void)typeText:(NSString *)text delayMs:(int)delay;
+ (BOOL)checkAccessibilityPermission;
+ (void)requestAccessibilityPermission;
@end
