/**
 * The accel modifier: the one key a platform binds its own commands to, ⌘ on
 * Apple and ctrl everywhere else. The web platform never shipped a portable
 * read for it — `getModifierState("Accel")` is Firefox's alone — so this is the
 * single place that decides which modifier is held and how to spell it.
 *
 * Exclusive, never a union. On macOS ctrl+click *is* the secondary click, so a
 * handler that accepted either modifier would make one ctrl+click both act and
 * open the context menu.
 *
 * That collision is a pointer problem, which sets where this belongs:
 *
 * - **Pointer** handlers take `accelPressed` — the exclusive read, because a
 *   union misfires on the Mac.
 * - **Keyboard** shortcuts keep `metaKey || ctrlKey` deliberately. No press
 *   collides, and the zoom chords must claim whichever modifier this platform's
 *   browser would have zoomed the page with, so the union is the safe superset.
 */

/** The modifier fields every pointer and keyboard event carries. */
export interface ModifierLike {
	metaKey: boolean;
	ctrlKey: boolean;
}

/**
 * Whether a platform string names an Apple platform. Pure: both branches stay
 * testable. Anchored and case-insensitive because the two sources disagree on
 * spelling — `userAgentData.platform` says "macOS", `navigator.platform` says
 * "MacIntel" — and an unanchored match would take any string carrying "ip".
 */
export function applePlatform(platform: string): boolean {
	return /^mac|^ip(hone|ad|od)/i.test(platform);
}

/**
 * What the browser calls itself. `userAgentData` leads because
 * `navigator.platform` is deprecated; it is Chromium-only, which the canvas
 * already requires. With no navigator at all — node, tests — Apple is the
 * honest default: the labels were written against ⌘.
 */
function readPlatform(): string {
	if (typeof navigator === "undefined") return "Mac";
	const modern = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform;
	return modern ?? navigator.platform;
}

let detected: string | undefined;

/** The platform string, read once — `accelPressed` sits in the pointer-move path. */
export function currentPlatform(): string {
	detected ??= readPlatform();
	return detected;
}

/** Whether this event holds the accel modifier down. */
export function accelPressed(event: ModifierLike, platform = currentPlatform()): boolean {
	return applePlatform(platform) ? event.metaKey : event.ctrlKey;
}

/** How this platform spells the accel modifier, ready to prefix a key: `⌘Z`, `ctrl+Z`. */
export function accelLabel(platform = currentPlatform()): string {
	return applePlatform(platform) ? "⌘" : "ctrl+";
}

/** The accel modifier's own `KeyboardEvent.key`, for tracking press and release. */
export function accelKeyName(platform = currentPlatform()): AccelKeyName {
	return applePlatform(platform) ? "Meta" : "Control";
}

/** The two keys that can be a platform's accel modifier. Frames report which one moved. */
export type AccelKeyName = "Meta" | "Control";

/** Whether a `KeyboardEvent.key` is one a platform could bind accel to. */
export function isAccelKeyName(key: string): key is AccelKeyName {
	return key === "Meta" || key === "Control";
}
