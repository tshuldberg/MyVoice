#import <Foundation/Foundation.h>

// Audio recording bridge (captures audio for Whisper transcription)
@interface SpeechBridge : NSObject
+ (void)requestAuthorization:(void (^)(BOOL granted))callback;
+ (BOOL)isAvailable;
+ (void)startRecognitionWithLocale:(NSString *)locale
                   onPartialResult:(void (^)(NSString *text))partialCallback
                     onFinalResult:(void (^)(NSString *text))finalCallback
                      onAudioLevel:(void (^)(float level))levelCallback
                           onError:(void (^)(NSString *error))errorCallback;
+ (NSString *)stopAndSaveRecording;
+ (NSString *)snapshotRecordingToPath:(NSString *)path maxSeconds:(double)maxSeconds;
+ (NSData *)wavDataFromPCM:(NSData *)pcm sampleRate:(double)sampleRate;
+ (void)setLowSampleRate:(BOOL)enabled;
+ (void)stopRecognition;
+ (NSArray<NSDictionary *> *)listAudioInputDevices;
+ (BOOL)setAudioInputDeviceUID:(NSString *)deviceUID;
+ (void)clearAudioInputDevice;
@end

// fn key events ("down", "up", "other"); gestures are decided in TypeScript
@interface HotkeyBridge : NSObject
+ (void)startFnEventsWithCallback:(void (^)(NSString *type, double timestampMs))callback;
+ (void)stopMonitoring;
@end

// Keyboard simulation bridge
@interface KeyboardBridge : NSObject
+ (void)typeText:(NSString *)text delayMs:(int)delay;
+ (void)pasteFromClipboard;
+ (void)pressReturn;
+ (BOOL)checkAccessibilityPermission;
+ (void)requestAccessibilityPermission;
@end

// System audio for meeting recordings (ScreenCaptureKit)
@interface MeetingBridge : NSObject
+ (void)startSystemAudioWithCompletion:(void (^)(NSString *error))completion;
+ (NSString *)stopSystemAudioAndSaveToPath:(NSString *)path;
+ (BOOL)isRecording;
@end

// Frontmost app, caret context, pasteboard and output volume
@interface SystemBridge : NSObject
+ (NSDictionary *)frontmostApplication;
+ (NSDictionary *)focusedTextContext;
+ (NSDictionary *)focusedSelectionContext;
+ (NSString *)runAppleScript:(NSString *)source;
+ (NSInteger)pasteboardSave;
+ (NSInteger)pasteboardWriteText:(NSString *)text;
+ (BOOL)pasteboardRestoreIfUnchanged:(NSInteger)expectedChangeCount;
+ (float)outputVolume;
+ (BOOL)setOutputVolume:(float)volume;
@end
