#import "SwiftBridge.h"
#import <AVFoundation/AVFoundation.h>
#import <CoreAudio/CoreAudio.h>
#import <AudioToolbox/AudioToolbox.h>

@implementation SpeechBridge

static AVAudioEngine *audioEngine;
static NSMutableData *pcmData;
static double recordingSampleRate;
static id configObserver;
static NSString *selectedDeviceUID;

+ (void)requestAuthorization:(void (^)(BOOL granted))callback {
    // No speech recognition auth needed with Whisper — just check mic access
    switch ([AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]) {
        case AVAuthorizationStatusAuthorized: {
            callback(YES);
            break;
        }
        case AVAuthorizationStatusNotDetermined: {
            [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    callback(granted);
                });
            }];
            break;
        }
        default: {
            callback(NO);
            break;
        }
    }
}

+ (BOOL)isAvailable {
    return YES; // Whisper is always available if the binary exists
}

+ (void)startRecognitionWithLocale:(NSString *)locale
                   onPartialResult:(void (^)(NSString *text))partialCallback
                     onFinalResult:(void (^)(NSString *text))finalCallback
                      onAudioLevel:(void (^)(float level))levelCallback
                           onError:(void (^)(NSString *error))errorCallback {

    // Stop any existing session
    [self stopRecognition];

    // Set up audio engine
    audioEngine = [[AVAudioEngine alloc] init];

    // Apply selected audio input device if set
    if (selectedDeviceUID && selectedDeviceUID.length > 0) {
        AudioObjectPropertyAddress translateAddr = {
            kAudioHardwarePropertyTranslateUIDToDevice,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        CFStringRef uidRef = (__bridge CFStringRef)selectedDeviceUID;
        AudioDeviceID deviceId = kAudioObjectUnknown;
        UInt32 deviceIdSize = sizeof(deviceId);
        OSStatus status = AudioObjectGetPropertyData(
            kAudioObjectSystemObject, &translateAddr, sizeof(uidRef), &uidRef,
            &deviceIdSize, &deviceId
        );
        if (status == noErr && deviceId != kAudioObjectUnknown) {
            OSStatus setStatus = AudioUnitSetProperty(
                audioEngine.inputNode.audioUnit,
                kAudioOutputUnitProperty_CurrentDevice,
                kAudioUnitScope_Global, 0,
                &deviceId, sizeof(deviceId)
            );
            if (setStatus == noErr) {
                NSLog(@"[MyVoice] Set audio input device: %@ (id=%u)", selectedDeviceUID, (unsigned)deviceId);
            } else {
                NSLog(@"[MyVoice] Failed to set audio input device (status=%d), using default", (int)setStatus);
            }
        } else {
            NSLog(@"[MyVoice] Could not translate device UID '%@' (status=%d), using default", selectedDeviceUID, (int)status);
        }
    }

    AVAudioInputNode *inputNode = audioEngine.inputNode;

    // Use the hardware's native format — whisper-cli resamples internally
    AVAudioFormat *inputFormat = [inputNode outputFormatForBus:0];

    NSLog(@"[MyVoice] Input format: sampleRate=%.0f channels=%u",
          inputFormat.sampleRate, (unsigned)inputFormat.channelCount);

    if (inputFormat.channelCount == 0) {
        errorCallback(@"No audio input available. Check microphone permission.");
        return;
    }

    // Accumulate PCM data for WAV file at the hardware sample rate
    pcmData = [NSMutableData data];
    recordingSampleRate = inputFormat.sampleRate;

    NSLog(@"[MyVoice] Recording at %.0fHz for Whisper (will resample internally)",
          recordingSampleRate);

    // Install tap at native format (nil = node's output format, avoids mismatch crash)
    [inputNode installTapOnBus:0 bufferSize:4096 format:nil
        block:^(AVAudioPCMBuffer * _Nonnull buffer, AVAudioTime * _Nonnull when) {

        float *channelData = buffer.floatChannelData[0];
        if (!channelData) return;

        UInt32 frameLength = buffer.frameLength;

        // Append first channel's PCM float data for WAV file
        [pcmData appendBytes:channelData length:frameLength * sizeof(float)];

        // Calculate RMS level for waveform visualization
        float sumSquares = 0.0f;
        for (UInt32 i = 0; i < frameLength; i++) {
            sumSquares += channelData[i] * channelData[i];
        }

        float rms = sqrtf(sumSquares / (float)frameLength);
        float normalized = fminf(1.0f, rms / 0.03f);

        levelCallback(normalized);
    }];

    // Observe mic disconnect
    configObserver = [[NSNotificationCenter defaultCenter]
        addObserverForName:AVAudioEngineConfigurationChangeNotification
        object:audioEngine queue:nil usingBlock:^(NSNotification * _Nonnull note) {
        errorCallback(@"Audio input changed. Microphone may have been disconnected.");
        [self stopRecognition];
    }];

    // Start audio engine
    NSError *engineError;
    [audioEngine prepare];
    if (![audioEngine startAndReturnError:&engineError]) {
        NSLog(@"[MyVoice] Audio engine failed: %@", engineError.localizedDescription);
        errorCallback([NSString stringWithFormat:@"Audio engine failed: %@",
            engineError.localizedDescription]);
    } else {
        NSLog(@"[MyVoice] Audio engine started (recording to buffer)");
    }
}

+ (NSString *)stopAndSaveRecording {
    // Stop engine
    if (configObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:configObserver];
        configObserver = nil;
    }
    if (audioEngine && audioEngine.isRunning) {
        [audioEngine stop];
        [audioEngine.inputNode removeTapOnBus:0];
    }
    audioEngine = nil;

    if (!pcmData || pcmData.length == 0) {
        NSLog(@"[MyVoice] No audio data recorded");
        return nil;
    }

    // Write WAV file to temp directory
    NSString *tempPath = [NSTemporaryDirectory() stringByAppendingPathComponent:@"myvoice_recording.wav"];
    NSLog(@"[MyVoice] Writing WAV: %lu bytes PCM → %@", (unsigned long)pcmData.length, tempPath);

    // Build WAV header (PCM float32, mono, at hardware sample rate)
    uint32_t dataSize = (uint32_t)pcmData.length;
    uint32_t fileSize = 36 + dataSize;
    uint16_t audioFormat = 3; // IEEE float
    uint16_t numChannels = 1;
    uint32_t sampleRate = (uint32_t)recordingSampleRate;
    uint16_t bitsPerSample = 32;
    uint32_t byteRate = sampleRate * numChannels * bitsPerSample / 8;
    uint16_t blockAlign = numChannels * bitsPerSample / 8;

    NSMutableData *wavData = [NSMutableData dataWithCapacity:44 + dataSize];

    // RIFF header
    [wavData appendBytes:"RIFF" length:4];
    [wavData appendBytes:&fileSize length:4];
    [wavData appendBytes:"WAVE" length:4];

    // fmt chunk
    [wavData appendBytes:"fmt " length:4];
    uint32_t fmtSize = 16;
    [wavData appendBytes:&fmtSize length:4];
    [wavData appendBytes:&audioFormat length:2];
    [wavData appendBytes:&numChannels length:2];
    [wavData appendBytes:&sampleRate length:4];
    [wavData appendBytes:&byteRate length:4];
    [wavData appendBytes:&blockAlign length:2];
    [wavData appendBytes:&bitsPerSample length:2];

    // data chunk
    [wavData appendBytes:"data" length:4];
    [wavData appendBytes:&dataSize length:4];
    [wavData appendData:pcmData];

    [wavData writeToFile:tempPath atomically:YES];

    pcmData = nil;

    float durationSec = (float)dataSize / (float)(sampleRate * numChannels * bitsPerSample / 8);
    NSLog(@"[MyVoice] WAV written: %.1f seconds, %u bytes", durationSec, (unsigned)(44 + dataSize));

    return tempPath;
}

+ (void)stopRecognition {
    if (configObserver) {
        [[NSNotificationCenter defaultCenter] removeObserver:configObserver];
        configObserver = nil;
    }
    if (audioEngine) {
        if (audioEngine.isRunning) {
            [audioEngine stop];
            [audioEngine.inputNode removeTapOnBus:0];
        }
    }
    audioEngine = nil;
    pcmData = nil;
}

+ (NSArray<NSDictionary *> *)listAudioInputDevices {
    AudioObjectPropertyAddress devicesAddr = {
        kAudioHardwarePropertyDevices,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };

    UInt32 dataSize = 0;
    OSStatus status = AudioObjectGetPropertyDataSize(
        kAudioObjectSystemObject, &devicesAddr, 0, NULL, &dataSize
    );
    if (status != noErr || dataSize == 0) return @[];

    UInt32 deviceCount = dataSize / sizeof(AudioDeviceID);
    AudioDeviceID *deviceIds = (AudioDeviceID *)malloc(dataSize);
    status = AudioObjectGetPropertyData(
        kAudioObjectSystemObject, &devicesAddr, 0, NULL, &dataSize, deviceIds
    );
    if (status != noErr) {
        free(deviceIds);
        return @[];
    }

    NSMutableArray<NSDictionary *> *results = [NSMutableArray array];

    for (UInt32 i = 0; i < deviceCount; i++) {
        AudioDeviceID deviceId = deviceIds[i];

        // Check if device has input streams
        AudioObjectPropertyAddress streamsAddr = {
            kAudioDevicePropertyStreams,
            kAudioDevicePropertyScopeInput,
            kAudioObjectPropertyElementMain
        };
        UInt32 streamsSize = 0;
        status = AudioObjectGetPropertyDataSize(deviceId, &streamsAddr, 0, NULL, &streamsSize);
        if (status != noErr || streamsSize == 0) continue;

        // Get device UID
        AudioObjectPropertyAddress uidAddr = {
            kAudioDevicePropertyDeviceUID,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        CFStringRef uidRef = NULL;
        UInt32 uidSize = sizeof(uidRef);
        status = AudioObjectGetPropertyData(deviceId, &uidAddr, 0, NULL, &uidSize, &uidRef);
        if (status != noErr || !uidRef) continue;

        // Get device name
        AudioObjectPropertyAddress nameAddr = {
            kAudioObjectPropertyName,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        CFStringRef nameRef = NULL;
        UInt32 nameSize = sizeof(nameRef);
        status = AudioObjectGetPropertyData(deviceId, &nameAddr, 0, NULL, &nameSize, &nameRef);
        if (status != noErr || !nameRef) {
            CFRelease(uidRef);
            continue;
        }

        [results addObject:@{
            @"uid": (__bridge_transfer NSString *)uidRef,
            @"name": (__bridge_transfer NSString *)nameRef,
        }];
    }

    free(deviceIds);
    return [results copy];
}

+ (BOOL)setAudioInputDeviceUID:(NSString *)deviceUID {
    if (!deviceUID || deviceUID.length == 0) {
        [self clearAudioInputDevice];
        return YES;
    }
    selectedDeviceUID = [deviceUID copy];
    NSLog(@"[MyVoice] Audio input device UID set to: %@", selectedDeviceUID);
    return YES;
}

+ (void)clearAudioInputDevice {
    selectedDeviceUID = nil;
    NSLog(@"[MyVoice] Audio input device cleared (using system default)");
}

@end
