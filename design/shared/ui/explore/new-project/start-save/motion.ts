/** spool's entering curve; everything that arrives here stays under 300ms on it */
export const EASE = [0.22, 0.61, 0.36, 1] as const;
/** the house curve, for things settling into a layout */
export const SETTLE = [0.23, 1, 0.32, 1] as const;

/**
 * A sheet hangs from the bar the way a macOS sheet hangs from a title bar: it is
 * unrolled downward from its top edge, so it reads as coming out of the thing it
 * hangs from. Leaving rolls it back up, faster.
 */
export const SHEET = {
	initial: { clipPath: "inset(0% 0% 100% 0%)", y: -6 },
	animate: { clipPath: "inset(0% 0% 0% 0%)", y: 0, transition: { duration: 0.24, ease: EASE } },
	exit: { clipPath: "inset(0% 0% 100% 0%)", y: -4, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
} as const;

export const SCRIM = {
	initial: { opacity: 0 },
	animate: { opacity: 1, transition: { duration: 0.14 } },
	exit: { opacity: 0, transition: { duration: 0.14 } },
} as const;
