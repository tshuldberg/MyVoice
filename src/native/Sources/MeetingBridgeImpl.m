#import "SwiftBridge.h"
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreMedia/CoreMedia.h>

// Records the Mac's own audio output (the other people in a call) with
// ScreenCaptureKit (audio capture needs macOS 13, MyVoice's minimum). macOS
// asks once for Screen & System Audio Recording. The microphone is recorded
// separately by SpeechBridge.

@interface MeetingAudioSink : NSObject <SCStreamOutput, SCStreamDelegate>
@property (nonatomic, strong) NSMutableData *pcm;
@property (nonatomic) double sampleRate;
@property (nonatomic, copy) NSString *lastError;
@end

@implementation MeetingAudioSink

- (instancetype)init {
    if ((self = [super init])) {
        _pcm = [NSMutableData data];
        _sampleRate = 48000;
    }
    return self;
}

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type {
    // Video frames are requested at the smallest size and ignored.
    if (type != SCStreamOutputTypeAudio || !CMSampleBufferIsValid(sampleBuffer)) return;

    CMFormatDescriptionRef format = CMSampleBufferGetFormatDescription(sampleBuffer);
    const AudioStreamBasicDescription *asbd = format ? CMAudioFormatDescriptionGetStreamBasicDescription(format) : NULL;
    if (!asbd || !(asbd->mFormatFlags & kAudioFormatFlagIsFloat)) return;

    size_t listSize = 0;
    CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sampleBuffer, &listSize, NULL, 0, NULL, NULL, 0, NULL);
    if (listSize == 0) return;
    AudioBufferList *list = malloc(listSize);
    CMBlockBufferRef block = NULL;
    OSStatus status = CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(
        sampleBuffer, NULL, list, listSize, NULL, NULL,
        kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment, &block);

    if (status == noErr) {
        CMItemCount frames = CMSampleBufferGetNumSamples(sampleBuffer);
        BOOL interleaved = !(asbd->mFormatFlags & kAudioFormatFlagIsNonInterleaved);
        UInt32 channels = MAX(1, asbd->mChannelsPerFrame);
        float *mono = calloc((size_t)frames, sizeof(float));
        for (CMItemCount frame = 0; frame < frames; frame++) {
            float sum = 0;
            for (UInt32 channel = 0; channel < channels; channel++) {
                if (interleaved) {
                    sum += ((float *)list->mBuffers[0].mData)[frame * channels + channel];
                } else if (channel < list->mNumberBuffers) {
                    sum += ((float *)list->mBuffers[channel].mData)[frame];
                }
            }
            mono[frame] = sum / (float)channels;
        }
        @synchronized (self) {
            [self.pcm appendBytes:mono length:(NSUInteger)frames * sizeof(float)];
            self.sampleRate = asbd->mSampleRate;
        }
        free(mono);
    }
    if (block) CFRelease(block);
    free(list);
}

- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
    self.lastError = error.localizedDescription;
    NSLog(@"[MyVoice] System audio capture stopped: %@", error.localizedDescription);
}

@end

@implementation MeetingBridge

static SCStream *meetingStream;
static MeetingAudioSink *meetingSink;
static dispatch_queue_t meetingQueue;

+ (void)startSystemAudioWithCompletion:(void (^)(NSString *error))completion {
    if (meetingStream) {
        completion(@"A meeting recording is already running.");
        return;
    }
    [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent *content, NSError *error) {
        if (error || content.displays.count == 0) {
            completion(error ? error.localizedDescription : @"No display is available for capture.");
            return;
        }
        SCContentFilter *filter = [[SCContentFilter alloc] initWithDisplay:content.displays.firstObject excludingWindows:@[]];
        SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
        config.capturesAudio = YES;
        config.excludesCurrentProcessAudio = YES;
        // 16 kHz mono is what whisper uses, and keeps an hour near 230 MB in memory.
        config.sampleRate = 16000;
        config.channelCount = 1;
        // Audio is the point; keep the unavoidable video stream tiny and slow.
        config.width = 2;
        config.height = 2;
        config.minimumFrameInterval = CMTimeMake(1, 1);

        MeetingAudioSink *sink = [[MeetingAudioSink alloc] init];
        SCStream *stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:sink];
        if (!meetingQueue) meetingQueue = dispatch_queue_create("com.trey.myvoice.meeting-audio", DISPATCH_QUEUE_SERIAL);
        NSError *addError = nil;
        if (![stream addStreamOutput:sink type:SCStreamOutputTypeAudio sampleHandlerQueue:meetingQueue error:&addError]) {
            completion(addError.localizedDescription ?: @"Could not capture system audio.");
            return;
        }
        [stream startCaptureWithCompletionHandler:^(NSError *startError) {
            if (startError) {
                completion(startError.localizedDescription);
                return;
            }
            meetingStream = stream;
            meetingSink = sink;
            completion(nil);
        }];
    }];
}

+ (NSString *)stopSystemAudioAndSaveToPath:(NSString *)path {
    SCStream *stream = meetingStream;
    MeetingAudioSink *sink = meetingSink;
    meetingStream = nil;
    meetingSink = nil;
    if (!stream || !sink) return nil;

    dispatch_semaphore_t stopped = dispatch_semaphore_create(0);
    [stream stopCaptureWithCompletionHandler:^(NSError *error) {
        dispatch_semaphore_signal(stopped);
    }];
    dispatch_semaphore_wait(stopped, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC));

    NSData *pcm;
    double sampleRate;
    @synchronized (sink) {
        pcm = [sink.pcm copy];
        sampleRate = sink.sampleRate;
    }
    if (pcm.length == 0) return nil;
    if (![[SpeechBridge wavDataFromPCM:pcm sampleRate:sampleRate] writeToFile:path atomically:YES]) return nil;
    return path;
}

+ (BOOL)isRecording {
    return meetingStream != nil;
}

@end
