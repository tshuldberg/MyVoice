#import "SwiftBridge.h"
#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>

@implementation HotkeyBridge

static id globalMonitor;
static id localMonitor;
static BOOL fnCurrentlyDown;

// Reports raw fn transitions ("down", "up") and "other" when another key or
// modifier is used while fn is held. Double-tap and hold-to-talk are decided in
// TypeScript (src/main/fn-gesture.ts) so they can be unit tested.
+ (void)startFnEventsWithCallback:(void (^)(NSString *type, double timestampMs))callback {
    [self stopMonitoring];
    fnCurrentlyDown = NO;

    void (^handle)(NSEvent *) = ^(NSEvent *event) {
        double now = [[NSDate date] timeIntervalSince1970] * 1000.0;
        if (event.type == NSEventTypeKeyDown) {
            if (fnCurrentlyDown) callback(@"other", now);
            return;
        }

        BOOL fnDown = (event.modifierFlags & NSEventModifierFlagFunction) != 0;
        if (event.keyCode != kVK_Function) {
            if (fnCurrentlyDown) callback(@"other", now);
            return;
        }
        if (fnDown == fnCurrentlyDown) return;
        fnCurrentlyDown = fnDown;
        callback(fnDown ? @"down" : @"up", now);
    };

    NSEventMask mask = NSEventMaskFlagsChanged | NSEventMaskKeyDown;
    globalMonitor = [NSEvent addGlobalMonitorForEventsMatchingMask:mask handler:handle];
    // Global monitors never see events sent to MyVoice's own windows.
    localMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:mask handler:^NSEvent *(NSEvent *event) {
        handle(event);
        return event;
    }];

    if (!globalMonitor) {
        NSLog(@"MyVoice: Failed to create global event monitor. Check Accessibility permissions.");
    }
}

+ (void)stopMonitoring {
    if (globalMonitor) {
        [NSEvent removeMonitor:globalMonitor];
        globalMonitor = nil;
    }
    if (localMonitor) {
        [NSEvent removeMonitor:localMonitor];
        localMonitor = nil;
    }
    fnCurrentlyDown = NO;
}

@end
