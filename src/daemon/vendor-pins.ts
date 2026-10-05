/**
 * Where a frame finds what Spool vendors (#16), by import map: the one pinned
 * React bundle for every React specifier, and the flow and stamping runtimes.
 * The daemon serves them (vendor.ts); a document's import map names them.
 */

export const REACT_SPECIFIERS = ["react", "react-dom", "react-dom/client", "react/jsx-runtime"] as const;

export const VENDOR_REACT_URL = "/vendor/react.js";

export const VENDOR_SPOOL_URL = "/vendor/spool.js";

export const VENDOR_SPOOL_JSX_URL = "/vendor/spool-jsx.js";

/** Spool's import map pins: the pinned React and the flow runtime always win. */
export function importMapPins(): Record<string, string> {
	return {
		...Object.fromEntries(REACT_SPECIFIERS.map((spec) => [spec, VENDOR_REACT_URL])),
		spool: VENDOR_SPOOL_URL,
		// the stamping JSX runtime the compiler injects (#23) — not agent surface
		"spool/jsx-dev-runtime": VENDOR_SPOOL_JSX_URL,
	};
}
