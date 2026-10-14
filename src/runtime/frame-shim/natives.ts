/**
 * Both taken before any module evaluates, because frame code may replace
 * either: an animation library may own rAF outright. The shim's own reads and
 * its own frames are spool's, not the frame's. This module comes first in the
 * shim's entry, so these are read before anything else in it runs.
 */
export const nativeFetch: typeof fetch = window.fetch.bind(window);
export const nativeRaf: typeof requestAnimationFrame = window.requestAnimationFrame.bind(window);
export const nativeCancelRaf: typeof cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

/** The served document's config (`assembleFrameDocument`), or nothing outside one. */
export interface ShimConfig {
	frame?: string;
	controlOrigin?: string;
}

export function shimConfig(): ShimConfig {
	return (window.__SPOOL__ || {}) as ShimConfig;
}
