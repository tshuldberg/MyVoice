#import "SwiftBridge.h"
#import <CoreGraphics/CoreGraphics.h>
#import <ApplicationServices/ApplicationServices.h>

@implementation KeyboardBridge

+ (void)typeText:(NSString *)text delayMs:(int)delay {
    CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);

    for (NSUInteger i = 0; i < text.length; i++) {
        unichar character = [text characterAtIndex:i];
        UniChar uniChar = (UniChar)character;

        // Create key down event
        CGEventRef keyDown = CGEventCreateKeyboardEvent(source, 0, true);
        CGEventKeyboardSetUnicodeString(keyDown, 1, &uniChar);
        CGEventPost(kCGHIDEventTap, keyDown);
        CFRelease(keyDown);

        // Create key up event
        CGEventRef keyUp = CGEventCreateKeyboardEvent(source, 0, false);
        CGEventKeyboardSetUnicodeString(keyUp, 1, &uniChar);
        CGEventPost(kCGHIDEventTap, keyUp);
        CFRelease(keyUp);

        // Delay between keystrokes
        if (delay > 0) {
            usleep(delay * 1000); // Convert ms to microseconds
        }
    }

    if (source) {
        CFRelease(source);
    }
}

+ (BOOL)checkAccessibilityPermission {
    NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @NO};
    return AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
}

+ (void)requestAccessibilityPermission {
    NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
    AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
}

@end
