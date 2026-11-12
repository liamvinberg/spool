// What a talk's slides need of macOS that Electron has no way to ask (spool#309), for the Mac app's main process:
//
//   options()                    the app's presentation options, NSApplicationPresentationOptions as a number
//   setOptions(options)          sets them, or answers false when AppKit refuses the combination
//   immediately(handle, change)  calls change() with macOS's animation of that window's frame turned off, or as it is
//                                when the handle names no window
//
// The options are how an app hides the menu bar and the Dock while it is the one in front. Electron sets them only for
// kiosk mode, which also locks ⌘Tab, so a window already full screen the macOS way otherwise lets both come down over
// the slides at the screen's edges.
//
// Simple full screen, which fills a window's display for the slides, ends in an animated frame change that blocks the
// main thread with no frame of the page drawn. AppKit asks the window how long that change takes (animationResizeTime:,
// which Apple documents for subclasses to override), and Electron's window class leaves the answer to NSWindow. So for
// the length of one call, and for the one window named, the answer is no time at all; every other window, and every
// other moment, gets the implementation that was there.
//
// src/presenting.ts loads it and scripts/native.sh builds it. It runs on the main thread, where Electron's main process
// runs its JavaScript and where AppKit has to be called, and refuses to load anywhere else.

#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <node_api.h>

/** The window whose frame changes at once while `immediately` runs, and nil otherwise. */
static NSWindow *immediateWindow;
/** What animationResizeTime: was before `immediately` stood in for it, kept after, for a caller already on its way. */
static IMP originalResizeTime;

static NSTimeInterval ResizeTime(NSWindow *self, SEL selector, NSRect frame) {
	if (self == immediateWindow) return 0;
	return ((NSTimeInterval (*)(NSWindow *, SEL, NSRect))originalResizeTime)(self, selector, frame);
}

/** Throws in JavaScript; NULL is how N-API is told an exception is pending. */
static napi_value Fail(napi_env env, const char *message) {
	napi_throw_type_error(env, NULL, message);
	return NULL;
}

static napi_value Answer(napi_env env, bool value) {
	napi_value result = NULL;
	napi_get_boolean(env, value, &result);
	return result;
}

/** The window a BrowserWindow's getNativeWindowHandle() names: the buffer holds a pointer to its content view. */
static NSWindow *WindowOf(napi_env env, napi_value handle) {
	bool buffer = false;
	void *data = NULL;
	size_t length = 0;
	if (napi_is_buffer(env, handle, &buffer) != napi_ok || !buffer) return nil;
	if (napi_get_buffer_info(env, handle, &data, &length) != napi_ok || length != sizeof(void *)) return nil;
	void *pointer = NULL;
	memcpy(&pointer, data, sizeof pointer);
	if (pointer == NULL) return nil;
	NSView *view = (__bridge NSView *)pointer;
	return [view isKindOfClass:[NSView class]] ? view.window : nil;
}

static napi_value Options(napi_env env, napi_callback_info info) {
	(void)info;
	napi_value result = NULL;
	napi_create_uint32(env, (uint32_t)NSApp.presentationOptions, &result);
	return result;
}

static napi_value SetOptions(napi_env env, napi_callback_info info) {
	size_t count = 1;
	napi_value argument = NULL;
	uint32_t options = 0;
	if (napi_get_cb_info(env, info, &count, &argument, NULL, NULL) != napi_ok || count < 1 ||
	    napi_get_value_uint32(env, argument, &options) != napi_ok)
		return Fail(env, "setOptions takes the presentation options as a number");
	@try {
		NSApp.presentationOptions = options;
	} @catch (NSException *refused) {
		// a combination AppKit does not allow, such as the menu bar hidden while the Dock shows
		return Answer(env, false);
	}
	return Answer(env, true);
}

static napi_value Immediately(napi_env env, napi_callback_info info) {
	size_t count = 2;
	napi_value arguments[2] = {NULL, NULL};
	napi_valuetype type = napi_undefined;
	if (napi_get_cb_info(env, info, &count, arguments, NULL, NULL) != napi_ok || count < 2)
		return Fail(env, "immediately takes a window's native handle and a function");
	if (napi_typeof(env, arguments[1], &type) != napi_ok || type != napi_function)
		return Fail(env, "immediately takes the change to make as a function");

	napi_value receiver = NULL;
	napi_value result = NULL;
	napi_get_undefined(env, &receiver);
	NSWindow *window = WindowOf(env, arguments[0]);
	Method method = window == nil ? NULL : class_getInstanceMethod(object_getClass(window), @selector(animationResizeTime:));
	// a change still happens, animated, for a handle that names no window or inside another window's change
	if (method == NULL || immediateWindow != nil) {
		napi_status status = napi_call_function(env, receiver, arguments[1], 0, NULL, &result);
		return status == napi_ok ? result : NULL;
	}
	IMP original = method_getImplementation(method);
	originalResizeTime = original;
	immediateWindow = window;
	method_setImplementation(method, (IMP)ResizeTime);
	napi_status status = napi_call_function(env, receiver, arguments[1], 0, NULL, &result);
	method_setImplementation(method, original);
	immediateWindow = nil;
	// what change() threw is pending, and goes on to the caller
	return status == napi_ok ? result : NULL;
}

NAPI_MODULE_INIT() {
	if (![NSThread isMainThread]) return Fail(env, "the presenting module loads on the main thread only");
	napi_property_descriptor properties[] = {
	    {"options", NULL, Options, NULL, NULL, NULL, napi_enumerable, NULL},
	    {"setOptions", NULL, SetOptions, NULL, NULL, NULL, napi_enumerable, NULL},
	    {"immediately", NULL, Immediately, NULL, NULL, NULL, napi_enumerable, NULL},
	};
	if (napi_define_properties(env, exports, sizeof properties / sizeof properties[0], properties) != napi_ok) return NULL;
	return exports;
}
