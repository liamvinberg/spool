import { cssPath } from "./pick";

/**
 * An element an agent named, found in a booted frame (`spool comments add --element`): by a CSS selector, or by an
 * element pointer, `path:line` (or `path:from-to`, as a comment block prints one), the file and first line its source
 * stamp names. What comes back is what the canvas's pick
 * hands a comment (the selector, outer HTML and source stamp, the selection's own handles) and where its box starts
 * in the frame's own pixels, which is where the pin goes. Null when nothing matches.
 */
export interface NamedElement {
	x: number;
	y: number;
	selector: string;
	outerHtml: string;
	source: string | null;
	generated: boolean;
}

export function namedElement(target: string): NamedElement | null {
	const el = byPointer(target) ?? bySelector(target);
	if (el === null) return null;
	let stamped: Element | null = el;
	while (stamped !== null && !stamped.hasAttribute("data-spool-source")) stamped = stamped.parentElement;
	const rect = el.getBoundingClientRect();
	return {
		x: rect.x + window.scrollX,
		y: rect.y + window.scrollY,
		selector: cssPath(el),
		outerHtml: el.outerHTML.slice(0, 240),
		source: stamped === null ? null : stamped.getAttribute("data-spool-source"),
		generated: stamped !== el,
	};
}

function bySelector(selector: string): Element | null {
	try {
		return document.getElementById("root")?.querySelector(selector) ?? document.querySelector(selector);
	} catch {
		return null;
	}
}

/** The first element stamped from that file and line, in document order. */
function byPointer(target: string): Element | null {
	const pointer = /^(.+):(\d+)(?:-\d+)?$/.exec(target);
	if (pointer === null) return null;
	const [, path = "", line = ""] = pointer;
	for (const el of document.querySelectorAll("[data-spool-source]")) {
		const stamp = el.getAttribute("data-spool-source") ?? "";
		const parts = /^(.+):(\d+):(\d+)$/.exec(stamp);
		if (parts === null) continue;
		const [, file = "", at = ""] = parts;
		if (at === line && (file === path || file.endsWith(`/${path}`) || path.endsWith(`/${file}`))) return el;
	}
	return null;
}
