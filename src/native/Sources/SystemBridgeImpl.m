#import "SwiftBridge.h"
#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreAudio/CoreAudio.h>
#import <AudioToolbox/AudioToolbox.h>

@implementation SystemBridge

static NSArray<NSDictionary<NSString *, NSData *> *> *savedPasteboardItems;

// --- Frontmost app ---------------------------------------------------------

+ (NSDictionary *)frontmostApplication {
    NSRunningApplication *app = [[NSWorkspace sharedWorkspace] frontmostApplication];
    if (!app) return nil;
    return @{
        @"bundleId": app.bundleIdentifier ?: @"",
        @"name": app.localizedName ?: @"",
        @"pid": @(app.processIdentifier),
    };
}

// --- Focused text context ----------------------------------------------------

// Reads at most the two characters before the caret, never the whole field,
// and nothing from secure (password) fields.
+ (NSDictionary *)focusedTextContext {
    AXUIElementRef systemWide = AXUIElementCreateSystemWide();
    if (!systemWide) return nil;
    AXUIElementSetMessagingTimeout(systemWide, 0.1f);

    AXUIElementRef focused = NULL;
    AXError error = AXUIElementCopyAttributeValue(systemWide, kAXFocusedUIElementAttribute, (CFTypeRef *)&focused);
    CFRelease(systemWide);
    if (error != kAXErrorSuccess || !focused) return nil;

    NSDictionary *result = nil;
    CFTypeRef subrole = NULL;
    if (AXUIElementCopyAttributeValue(focused, kAXSubroleAttribute, &subrole) == kAXErrorSuccess && subrole) {
        BOOL secure = CFGetTypeID(subrole) == CFStringGetTypeID()
            && CFStringCompare((CFStringRef)subrole, kAXSecureTextFieldSubrole, 0) == kCFCompareEqualTo;
        CFRelease(subrole);
        if (secure) {
            CFRelease(focused);
            return @{ @"secure": @YES, @"before": @"", @"hasSelection": @NO };
        }
    }

    AXValueRef rangeValue = NULL;
    if (AXUIElementCopyAttributeValue(focused, kAXSelectedTextRangeAttribute, (CFTypeRef *)&rangeValue) == kAXErrorSuccess && rangeValue) {
        CFRange selection;
        if (AXValueGetValue(rangeValue, kAXValueTypeCFRange, &selection)) {
            CFIndex start = MAX(0, selection.location - 2);
            CFRange before = CFRangeMake(start, selection.location - start);
            NSString *text = @"";
            if (before.length > 0) {
                AXValueRef beforeValue = AXValueCreate(kAXValueTypeCFRange, &before);
                CFTypeRef beforeText = NULL;
                if (AXUIElementCopyParameterizedAttributeValue(focused, kAXStringForRangeParameterizedAttribute, beforeValue, &beforeText) == kAXErrorSuccess && beforeText) {
                    if (CFGetTypeID(beforeText) == CFStringGetTypeID()) {
                        text = [(__bridge NSString *)beforeText copy];
                    }
                    CFRelease(beforeText);
                }
                CFRelease(beforeValue);
            }
            result = @{
                @"secure": @NO,
                @"before": text,
                @"atStart": @(selection.location == 0),
                @"hasSelection": @(selection.length > 0),
            };
        }
        CFRelease(rangeValue);
    }

    CFRelease(focused);
    return result;
}

// The selected text and the focused window's title, for the optional AI
// screen context. Nothing is read from secure (password) fields.
+ (NSDictionary *)focusedSelectionContext {
    NSRunningApplication *front = [[NSWorkspace sharedWorkspace] frontmostApplication];
    if (!front) return nil;

    NSString *windowTitle = @"";
    AXUIElementRef appElement = AXUIElementCreateApplication(front.processIdentifier);
    if (appElement) {
        AXUIElementSetMessagingTimeout(appElement, 0.1f);
        AXUIElementRef window = NULL;
        if (AXUIElementCopyAttributeValue(appElement, kAXFocusedWindowAttribute, (CFTypeRef *)&window) == kAXErrorSuccess && window) {
            CFTypeRef title = NULL;
            if (AXUIElementCopyAttributeValue(window, kAXTitleAttribute, &title) == kAXErrorSuccess && title) {
                if (CFGetTypeID(title) == CFStringGetTypeID()) windowTitle = [(__bridge NSString *)title copy];
                CFRelease(title);
            }
            CFRelease(window);
        }
        CFRelease(appElement);
    }

    NSString *selectedText = @"";
    AXUIElementRef systemWide = AXUIElementCreateSystemWide();
    if (systemWide) {
        AXUIElementSetMessagingTimeout(systemWide, 0.1f);
        AXUIElementRef focused = NULL;
        if (AXUIElementCopyAttributeValue(systemWide, kAXFocusedUIElementAttribute, (CFTypeRef *)&focused) == kAXErrorSuccess && focused) {
            BOOL secure = NO;
            CFTypeRef subrole = NULL;
            if (AXUIElementCopyAttributeValue(focused, kAXSubroleAttribute, &subrole) == kAXErrorSuccess && subrole) {
                secure = CFGetTypeID(subrole) == CFStringGetTypeID()
                    && CFStringCompare((CFStringRef)subrole, kAXSecureTextFieldSubrole, 0) == kCFCompareEqualTo;
                CFRelease(subrole);
            }
            CFTypeRef selection = NULL;
            if (!secure && AXUIElementCopyAttributeValue(focused, kAXSelectedTextAttribute, &selection) == kAXErrorSuccess && selection) {
                if (CFGetTypeID(selection) == CFStringGetTypeID()) {
                    NSString *text = (__bridge NSString *)selection;
                    selectedText = text.length > 4000 ? [text substringToIndex:4000] : [text copy];
                }
                CFRelease(selection);
            }
            CFRelease(focused);
        }
        CFRelease(systemWide);
    }

    return @{ @"windowTitle": windowTitle, @"selectedText": selectedText };
}

// --- AppleScript -----------------------------------------------------------------

// Runs one of the fixed scripts in src/main/website-context.ts (never user
// input) and returns its string result, or nil. Needs the Apple Events
// entitlement and the user's Automation permission for the target browser.
+ (NSString *)runAppleScript:(NSString *)source {
    NSString *wrapped = [NSString stringWithFormat:@"with timeout of 1 seconds\n%@\nend timeout", source];
    NSAppleScript *script = [[NSAppleScript alloc] initWithSource:wrapped];
    NSDictionary *error = nil;
    NSAppleEventDescriptor *result = [script executeAndReturnError:&error];
    if (error || !result) {
        NSLog(@"[MyVoice] AppleScript failed: %@", error[NSAppleScriptErrorBriefMessage] ?: @"unknown error");
        return nil;
    }
    return result.stringValue;
}

// --- Pasteboard ----------------------------------------------------------------

+ (NSInteger)pasteboardSave {
    NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
    NSMutableArray *items = [NSMutableArray array];
    for (NSPasteboardItem *item in pasteboard.pasteboardItems) {
        NSMutableDictionary *copy = [NSMutableDictionary dictionary];
        for (NSPasteboardType type in item.types) {
            NSData *data = [item dataForType:type];
            if (data) copy[type] = data;
        }
        [items addObject:copy];
    }
    savedPasteboardItems = items;
    return pasteboard.changeCount;
}

// Marks the dictation as transient (nspasteboard.org convention) so clipboard
// managers do not record it in their history.
+ (NSInteger)pasteboardWriteText:(NSString *)text {
    NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
    [pasteboard clearContents];
    NSPasteboardItem *item = [[NSPasteboardItem alloc] init];
    [item setString:text forType:NSPasteboardTypeString];
    [item setData:[NSData data] forType:@"org.nspasteboard.TransientType"];
    [item setData:[NSData data] forType:@"org.nspasteboard.AutoGeneratedType"];
    [pasteboard writeObjects:@[item]];
    return pasteboard.changeCount;
}

// Restores what pasteboardSave captured, unless something else has written to
// the pasteboard since our write (then the user's newer copy wins).
+ (BOOL)pasteboardRestoreIfUnchanged:(NSInteger)expectedChangeCount {
    NSPasteboard *pasteboard = [NSPasteboard generalPasteboard];
    NSArray *items = savedPasteboardItems;
    savedPasteboardItems = nil;
    if (pasteboard.changeCount != expectedChangeCount || !items) return NO;

    [pasteboard clearContents];
    if (items.count == 0) return YES;
    NSMutableArray *restored = [NSMutableArray array];
    for (NSDictionary<NSString *, NSData *> *saved in items) {
        NSPasteboardItem *item = [[NSPasteboardItem alloc] init];
        [saved enumerateKeysAndObjectsUsingBlock:^(NSString *type, NSData *data, BOOL *stop) {
            [item setData:data forType:type];
        }];
        [restored addObject:item];
    }
    return [pasteboard writeObjects:restored];
}

// --- Output volume ---------------------------------------------------------------

static AudioObjectID defaultOutputDevice(void) {
    AudioObjectPropertyAddress address = {
        kAudioHardwarePropertyDefaultOutputDevice,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    AudioObjectID device = kAudioObjectUnknown;
    UInt32 size = sizeof(device);
    if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, NULL, &size, &device) != noErr) {
        return kAudioObjectUnknown;
    }
    return device;
}

static AudioObjectPropertyAddress mainVolumeAddress(void) {
    AudioObjectPropertyAddress address = {
        kAudioHardwareServiceDeviceProperty_VirtualMainVolume,
        kAudioDevicePropertyScopeOutput,
        kAudioObjectPropertyElementMain
    };
    return address;
}

/** Returns the output volume from 0 to 1, or -1 when the device has no volume control. */
+ (float)outputVolume {
    AudioObjectID device = defaultOutputDevice();
    AudioObjectPropertyAddress address = mainVolumeAddress();
    if (device == kAudioObjectUnknown || !AudioObjectHasProperty(device, &address)) return -1;
    Float32 volume = 0;
    UInt32 size = sizeof(volume);
    if (AudioObjectGetPropertyData(device, &address, 0, NULL, &size, &volume) != noErr) return -1;
    return volume;
}

+ (BOOL)setOutputVolume:(float)volume {
    AudioObjectID device = defaultOutputDevice();
    AudioObjectPropertyAddress address = mainVolumeAddress();
    if (device == kAudioObjectUnknown || !AudioObjectHasProperty(device, &address)) return NO;
    Boolean settable = false;
    if (AudioObjectIsPropertySettable(device, &address, &settable) != noErr || !settable) return NO;
    Float32 clamped = fmaxf(0.0f, fminf(1.0f, volume));
    return AudioObjectSetPropertyData(device, &address, 0, NULL, sizeof(clamped), &clamped) == noErr;
}

@end
