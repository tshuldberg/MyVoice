#import "SwiftBridge.h"
#import <Speech/Speech.h>
#import <AVFoundation/AVFoundation.h>

@implementation SpeechBridge

static SFSpeechRecognizer *recognizer;
static SFSpeechAudioBufferRecognitionRequest *recognitionRequest;
static SFSpeechRecognitionTask *recognitionTask;
static AVAudioEngine *audioEngine;

+ (void)requestAuthorization:(void (^)(BOOL granted))callback {
    [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
        dispatch_async(dispatch_get_main_queue(), ^{
            callback(status == SFSpeechRecognizerAuthorizationStatusAuthorized);
        });
    }];
}

+ (BOOL)isAvailable {
    SFSpeechRecognizer *rec = [[SFSpeechRecognizer alloc] initWithLocale:
        [NSLocale localeWithLocaleIdentifier:@"en-US"]];
    return rec != nil && rec.isAvailable;
}

+ (void)startRecognitionWithLocale:(NSString *)locale
                   onPartialResult:(void (^)(NSString *text))partialCallback
                     onFinalResult:(void (^)(NSString *text))finalCallback
                      onAudioLevel:(void (^)(float level))levelCallback
                           onError:(void (^)(NSString *error))errorCallback {

    // Stop any existing session
    [self stopRecognition];

    // Initialize recognizer
    recognizer = [[SFSpeechRecognizer alloc] initWithLocale:
        [NSLocale localeWithLocaleIdentifier:locale]];

    if (!recognizer || !recognizer.isAvailable) {
        errorCallback(@"Speech recognizer not available for this locale");
        return;
    }

    // Create recognition request
    recognitionRequest = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
    recognitionRequest.shouldReportPartialResults = YES;

    // Prefer on-device recognition for privacy
    if (@available(macOS 13.0, *)) {
        recognitionRequest.requiresOnDeviceRecognition = YES;
    }

    // Start recognition task
    recognitionTask = [recognizer recognitionTaskWithRequest:recognitionRequest
        resultHandler:^(SFSpeechRecognitionResult * _Nullable result, NSError * _Nullable error) {

        if (error) {
            errorCallback(error.localizedDescription);
            return;
        }

        if (result) {
            NSString *text = result.bestTranscription.formattedString;
            if (result.isFinal) {
                finalCallback(text);
            } else {
                partialCallback(text);
            }
        }
    }];

    // Set up audio engine
    audioEngine = [[AVAudioEngine alloc] init];
    AVAudioInputNode *inputNode = audioEngine.inputNode;
    AVAudioFormat *recordingFormat = [inputNode outputFormatForBus:0];

    // Install tap for audio data
    [inputNode installTapOnBus:0 bufferSize:1024 format:recordingFormat
        block:^(AVAudioPCMBuffer * _Nonnull buffer, AVAudioTime * _Nonnull when) {

        // Feed audio to speech recognizer
        [recognitionRequest appendAudioPCMBuffer:buffer];

        // Calculate RMS level for waveform visualization
        float *channelData = buffer.floatChannelData[0];
        UInt32 frameLength = buffer.frameLength;
        float sumSquares = 0.0f;

        for (UInt32 i = 0; i < frameLength; i++) {
            sumSquares += channelData[i] * channelData[i];
        }

        float rms = sqrtf(sumSquares / (float)frameLength);
        // Normalize to 0.0-1.0 range (typical speech RMS is 0.01-0.3)
        float normalized = fminf(1.0f, rms / 0.2f);

        levelCallback(normalized);
    }];

    // Observe audio engine configuration changes (mic disconnect/reconnect)
    [[NSNotificationCenter defaultCenter] addObserverForName:AVAudioEngineConfigurationChangeNotification
        object:audioEngine queue:nil usingBlock:^(NSNotification * _Nonnull note) {
        errorCallback(@"Audio input changed. Microphone may have been disconnected.");
        [self stopRecognition];
    }];

    // Start audio engine
    NSError *engineError;
    [audioEngine prepare];
    if (![audioEngine startAndReturnError:&engineError]) {
        errorCallback([NSString stringWithFormat:@"Audio engine failed: %@",
            engineError.localizedDescription]);
    }
}

+ (void)stopRecognition {
    if (audioEngine) {
        [[NSNotificationCenter defaultCenter] removeObserver:audioEngine
            name:AVAudioEngineConfigurationChangeNotification object:audioEngine];
        if (audioEngine.isRunning) {
            [audioEngine stop];
            [audioEngine.inputNode removeTapOnBus:0];
        }
    }

    if (recognitionRequest) {
        [recognitionRequest endAudio];
        recognitionRequest = nil;
    }

    if (recognitionTask) {
        [recognitionTask cancel];
        recognitionTask = nil;
    }

    audioEngine = nil;
    recognizer = nil;
}

@end
