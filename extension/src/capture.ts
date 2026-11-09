import type { ReferenceCapture, ReferenceStyle } from "../../src/reference-wire";
import type { Hovers } from "./hovers";

/**
 * Serializes what the picker picked into a reference capture (spool#241), in the tab, from the live DOM: pure DOM
 * functions, no extension APIs, so a plain page can run it.
 *
 * It keeps the site's own CSS and class names instead of inlining computed styles: every active stylesheet goes as
 * text (or as a link the daemon fetches, when the tab may not read it), and the markup keeps its classes, wrapped in
 * shallow copies of its ancestors so descendant selectors still match. Web Animations started from script become
 * `@keyframes`. What cannot come is left out, with a line in `notes`.
 */

export interface CaptureTarget {
	/** the picked element; the body for a whole page */
	el: Element;
	whole: boolean;
	/** what the picker's tab said it was on */
	label: string;
}

export interface CaptureOptions {
	/** a closed shadow root, when the caller can see one (an extension's `chrome.dom`), so it can be noted */
	closedShadowRoot?: (el: Element) => ShadowRoot | null;
	/** canvases already read, from {@link readCanvases}, so a WebGL drawing caught mid-frame isn't read again empty */
	drawn?: ReadonlyMap<HTMLCanvasElement, string>;
	/** what the site's script changed as the hand moved over it, from {@link watchHovers}, for the frame to do again */
	hovers?: Hovers;
}

const VOID = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"param",
	"source",
	"track",
	"wbr",
]);

/** never sent: script, what only shows without it, and what the document's sheets already carry */
const DROP = new Set(["script", "noscript", "template", "base", "meta", "title"]);
/** in the light DOM their sheets are in `document.styleSheets`; in a shadow root they are its only styles */
const SHEETS = new Set(["style", "link"]);

const URL_ATTRS = new Set([
	"href",
	"src",
	"poster",
	"action",
	"formaction",
	"cite",
	"background",
	"data",
	"xlink:href",
]);

const NOTE = {
	iframe: "embedded pages (iframes)",
	stream: "video streams (their posters came)",
	canvas: "a canvas drawn from another site",
	blank: "a WebGL canvas, which keeps no copy of what it drew",
	blob: "images made in the page (blob: URLs)",
	closed: "closed shadow roots",
	reveal: "the fade-ins of parts not scrolled to yet (shown as they end)",
} as const;

interface Context {
	base: string;
	notes: Set<string>;
	anims: Map<Element, string>;
	opts: CaptureOptions;
}

export function capture(target: CaptureTarget, opts: CaptureOptions = {}): ReferenceCapture {
	const doc = target.el.ownerDocument;
	const body = doc.body;
	const html = doc.documentElement;
	const el = target.el;
	const isBody = el === body;
	const notes = new Set<string>();
	const { css: animations, anims } = webAnimations(doc, el);
	const ctx: Context = { base: doc.baseURI, notes, anims, opts };

	const out: string[] = [];
	if (isBody) children(body, out, ctx, false);
	else {
		const chain: Element[] = [];
		for (let p = el.parentElement; p !== null && p !== body && p !== html; p = p.parentElement) chain.unshift(p);
		for (const a of chain) {
			standIns(a, "before", out);
			out.push(open(a, ctx, { contents: true }));
		}
		standIns(el, "before", out);
		element(el, out, ctx, false, true);
		standIns(el, "after", out);
		for (const a of chain.reverse()) {
			out.push(`</${a.localName}>`);
			standIns(a, "after", out);
		}
		sprites(el, out, ctx);
	}

	const bodyAttrs = attributes(body, ctx);
	if (isBody) bodyAttrs["data-spool-reference"] = "";
	const view = doc.defaultView;
	const r = el.getBoundingClientRect();
	const size = target.whole
		? { w: html.clientWidth, h: Math.max(html.scrollHeight, body.scrollHeight) }
		: { w: r.width, h: r.height };
	const backdrop = target.whole ? undefined : backdropOf(el);

	return {
		v: 1,
		url: doc.location?.href ?? doc.URL,
		title: doc.title,
		whole: target.whole,
		label: target.label,
		size: { w: Math.max(1, size.w), h: Math.max(1, size.h) },
		viewport: { w: Math.max(1, view?.innerWidth ?? html.clientWidth), h: Math.max(1, view?.innerHeight ?? 1) },
		html: out.join(""),
		htmlAttrs: attributes(html, ctx),
		bodyAttrs,
		...(backdrop === undefined ? {} : { backdrop }),
		styles: styles(doc),
		animations,
		notes: [...notes],
		unusedFonts: unusedFonts(doc),
	};
}

/* ---------------------------------------------------------------- markup -- */

function children(parent: Node, out: string[], ctx: Context, shadow: boolean): void {
	for (let n = parent.firstChild; n !== null; n = n.nextSibling) {
		if (n.nodeType === 3) out.push(text((n as Text).data));
		else if (n.nodeType === 1) element(n as Element, out, ctx, shadow, false);
	}
}

function element(el: Element, out: string[], ctx: Context, shadow: boolean, picked: boolean): void {
	const tag = el.localName;
	if (DROP.has(tag)) return;
	if (SHEETS.has(tag) && !shadow) return;
	// a <picture>'s sources are what currentSrc already chose from
	if (tag === "source" && el.parentElement?.localName === "picture") return;

	if (tag === "style") {
		out.push(`<style>${cssUrls(el.textContent ?? "", ctx.base)}</style>`);
		return;
	}
	// a shadow root's linked sheet, inlined when the tab may read it so it does not hang on the site
	const linked = tag === "link" ? (el as HTMLLinkElement).sheet : null;
	const css = linked === null ? null : readable(linked);
	if (css !== null) {
		out.push(`<style>${cssUrls(css, linked?.href ?? ctx.base)}</style>`);
		return;
	}
	out.push(open(el, ctx, { picked }));
	if (VOID.has(tag)) return;

	const root = (el as HTMLElement).shadowRoot;
	if (root !== null && root !== undefined) shadowRoot(root, out, ctx);
	else if (ctx.opts.closedShadowRoot?.(el)) ctx.notes.add(NOTE.closed);

	if (tag === "textarea") out.push(text((el as HTMLTextAreaElement).value));
	else if (tag === "iframe" || tag === "canvas") {
		// an iframe keeps its box but not its page; a canvas's drawing rides its background
	} else if (tag === "video" && stream(el as HTMLVideoElement)) {
		// its sources are a stream: the poster is what can come
	} else children(el, out, ctx, shadow);
	out.push(`</${tag}>`);
}

const SVG = "http://www.w3.org/2000/svg";
const REFERS = ["fill", "stroke", "mask", "clip-path", "filter", "marker-start", "marker-mid", "marker-end", "style"];

/**
 * The parts of the page outside a picked element that its SVG draws with: the symbols its icons `<use>` from a sprite
 * at the end of the body, the gradients, masks and filters those name, kept out of sight beside it.
 */
function sprites(el: Element, out: string[], ctx: Context): void {
	const doc = el.ownerDocument;
	const found: Element[] = [];
	const seen = new Set<string>();
	const visit = (root: Element) => {
		for (const node of [root, ...Array.from(root.querySelectorAll("*"))]) {
			const ids: string[] = [];
			const href = node.localName === "use" ? (node.getAttribute("href") ?? node.getAttribute("xlink:href")) : null;
			if (href?.startsWith("#")) ids.push(href.slice(1));
			for (const name of REFERS) {
				for (const m of (node.getAttribute(name) ?? "").matchAll(/url\(\s*['"]?#([^'")\s]+)/g)) {
					if (m[1] !== undefined) ids.push(m[1]);
				}
			}
			for (const id of ids) {
				if (seen.has(id)) continue;
				seen.add(id);
				const target = doc.getElementById(id);
				if (target === null || target.namespaceURI !== SVG || el.contains(target)) continue;
				if (found.some((one) => one.contains(target))) continue;
				found.push(target);
				visit(target);
			}
		}
	};
	visit(el);
	if (found.length === 0) return;
	out.push('<svg aria-hidden="true" style="position: absolute; width: 0; height: 0; overflow: hidden">');
	for (const target of found) element(target, out, ctx, false, false);
	out.push("</svg>");
}

/** how many stand-ins one element gets on each side at most, so a pick from a long feed stays small */
const STAND_INS = 200;
const STAND_IN_ATTR = /^(class|role|type|name|aria-.+|data-(?!spool-).+)$/;

/**
 * Empty stand-ins for the elements beside one in the picked element's line, never drawn, so the site's rules that
 * look at siblings (`:last-child`, `+`, `:has(~ *)`) match in the frame as they did in the tab: without them a
 * section the site hides once nothing follows it (a carousel waiting for its skeleton to go) hides the whole pick.
 * They keep what such rules name, the tag and the classes, roles and data, and nothing that loads.
 */
function standIns(el: Element, side: "before" | "after", out: string[]): void {
	const found: Element[] = [];
	const step = (e: Element) => (side === "before" ? e.previousElementSibling : e.nextElementSibling);
	for (let e = step(el); e !== null && found.length < STAND_INS; e = step(e)) found.push(e);
	if (side === "before") found.reverse();
	for (const e of found) {
		const tag = DROP.has(e.localName) || SHEETS.has(e.localName) ? "template" : e.localName;
		let s = `<${tag}`;
		for (const { name, value } of Array.from(e.attributes)) {
			if (STAND_IN_ATTR.test(name)) s += value === "" ? ` ${name}` : ` ${name}="${attr(value)}"`;
		}
		s += ' style="display: none !important">';
		out.push(VOID.has(tag) ? s : `${s}</${tag}>`);
	}
}

function shadowRoot(root: ShadowRoot, out: string[], ctx: Context): void {
	out.push(`<template shadowrootmode="open"${root.delegatesFocus ? " shadowrootdelegatesfocus" : ""}>`);
	const adopted = root.adoptedStyleSheets ?? [];
	for (const sheet of adopted) {
		const css = readable(sheet);
		if (css !== null) out.push(`<style>${cssUrls(css, ctx.base)}</style>`);
	}
	children(root, out, ctx, true);
	out.push("</template>");
}

/** an opening tag: the element's attributes, made safe and absolute, and what it is now (values, sources) */
function open(el: Element, ctx: Context, how: { contents?: boolean; picked?: boolean }): string {
	const a = attributes(el, ctx);
	const tag = el.localName;
	hovered(el, a, ctx);
	live(el, a, ctx);
	if (how.contents === true) addStyle(a, "display: contents !important");
	else {
		const shown = waitingToReveal(el);
		for (const decl of shown) addStyle(a, decl);
		if (shown.length > 0) ctx.notes.add(NOTE.reveal);
	}
	if (how.picked === true) {
		a["data-spool-reference"] = "";
		for (const decl of standAlone(el)) addStyle(a, decl);
		// what it drew behind itself (a hero's backdrop at z-index -1) sat in a stacking context of an ancestor that
		// the frame draws as nothing; without one of its own it would go behind the page's background
		addStyle(a, "isolation: isolate");
	}
	// the picked element's parent is an ancestor drawn as nothing: its scroll is none of the frame's
	if (how.contents !== true) for (const decl of scrollKept(el, how.picked !== true)) addStyle(a, decl);
	const anim = ctx.anims.get(el);
	if (anim !== undefined) a["data-spool-anim"] = anim;
	let s = `<${tag}`;
	for (const name in a) s += a[name] === "" ? ` ${name}` : ` ${name}="${attr(a[name] ?? "")}"`;
	return `${s}>`;
}

function attributes(el: Element, ctx: Context): Record<string, string> {
	const a: Record<string, string> = {};
	for (const at of Array.from(el.attributes)) {
		const value = safe(at.name, at.value, ctx);
		if (value !== null) a[at.name] = value;
	}
	return a;
}

/** an attribute's value made safe and absolute to leave the page; null for one that would run */
function safe(name: string, value: string, ctx: Context): string | null {
	const lower = name.toLowerCase();
	if (lower.startsWith("on")) return null;
	if (URL_ATTRS.has(lower)) {
		if (/^\s*javascript:/i.test(value)) return null;
		return value !== "" && !value.startsWith("#") ? absolute(value, ctx.base) : value;
	}
	if (lower === "style") return cssUrls(value, ctx.base);
	if (lower === "srcset" || lower === "imagesrcset") return srcset(value, ctx.base);
	return value;
}

/**
 * What the hand changes on the element, for the frame to do again as it hovers: the element at rest when the hand is on
 * it now, the values it takes on `data-spool-hover-set`, and the box that is hovered on `data-spool-hover`.
 */
function hovered(el: Element, a: Record<string, string>, ctx: Context): void {
	const hovers = ctx.opts.hovers;
	if (hovers === undefined) return;
	for (const [name, value] of hovers.rest.get(el) ?? []) {
		if (name.startsWith(":")) continue;
		const kept = value === null ? null : safe(name, value, ctx);
		if (kept === null) delete a[name];
		else a[name] = kept;
	}
	const sets = (hovers.sets.get(el) ?? []).flatMap(([id, name, value]): Array<[string, string, string | null]> => {
		if (name.startsWith(":")) return [[id, name, value]];
		const kept = value === null ? null : safe(name, value, ctx);
		return value !== null && kept === null ? [] : [[id, name, kept]];
	});
	if (sets.length > 0) a["data-spool-hover-set"] = JSON.stringify(sets);
	const id = hovers.triggers.get(el);
	if (id !== undefined) a["data-spool-hover"] = id;
}

/**
 * A part held invisible until it scrolls into view, and what to show it as it ends. Framer Motion's whileInView and its
 * like set it transparent inline; a site's own reveal does it with a class that waits for another, a box set off (moved,
 * shrunk or blurred) and eased in. Either is in the flow and out of view: one hidden where a person can see it is hidden
 * on purpose, as is one taken out of the flow (a slide, a menu), and an icon's part that only a hover shows (an arrow's
 * shaft) is no box. Of how it moves in, a shift, a growth or a blur is let go; any other turn stays.
 */
function waitingToReveal(el: Element): string[] {
	const view = el.ownerDocument.defaultView;
	const style = (el as HTMLElement).style;
	if (view === null || style === undefined) return [];
	const computed = view.getComputedStyle(el);
	if (computed.opacity !== "0" || /^(absolute|fixed)$/.test(computed.position)) return [];
	const eased = computed.transitionProperty.split(",").some((property, i) => {
		const duration = computed.transitionDuration.split(",")[i] ?? computed.transitionDuration.split(",")[0] ?? "0s";
		return /^\s*(opacity|all)\s*$/.test(property) && Number.parseFloat(duration) > 0;
	});
	const shifted = /^matrix\([^,]+,\s*0,\s*0,/.test(computed.transform);
	const blurred = /^(\s*blur\([^)]*\))+\s*$/.test(computed.filter);
	const boxSetOff = el instanceof view.HTMLElement && eased && (shifted || blurred);
	if (style.opacity !== "0" && !boxSetOff) return [];
	const r = el.getBoundingClientRect();
	if (r.height === 0 || (r.bottom > 0 && r.top < view.innerHeight)) return [];
	const out = ["opacity: 1 !important"];
	if (shifted) out.push("transform: none !important");
	if (blurred) out.push("filter: none !important");
	return out;
}

/**
 * A box a person or the page scrolled (a docs sidebar on its current entry, a carousel on its third card) kept where it
 * was, though the frame runs no script to scroll it: the box snaps, as it lays out, to one child set to stand where it
 * stood. Its other children snap nowhere, so theirs can't pull it elsewhere. `inBox` says whether the parent is drawn.
 */
export function scrollKept(el: Element, inBox: boolean): string[] {
	const out: string[] = [];
	const own = scrolled(el);
	if (own !== null) {
		const axis = own.top !== 0 && own.left !== 0 ? "both" : own.top !== 0 ? "y" : "x";
		out.push(`scroll-snap-type: ${axis} mandatory !important`, "scroll-padding: 0 !important");
	}
	const box = inBox ? el.parentElement : null;
	const plan = box === null ? null : scrolled(box);
	if (box !== null && plan !== null) {
		if (plan.at !== el) out.push("scroll-snap-align: none !important");
		else {
			const r = el.getBoundingClientRect();
			const b = box.getBoundingClientRect();
			const top = round(r.top - b.top - box.clientTop);
			const left = round(r.left - b.left - box.clientLeft);
			out.push("scroll-snap-align: start !important", `scroll-margin: ${top}px 0 0 ${left}px !important`);
		}
	}
	return out;
}

/** how far a box (not the page's own scroll) had scrolled, and the child it snaps to; null for one at its start */
function scrolled(box: Element): { top: number; left: number; at: Element } | null {
	const doc = box.ownerDocument;
	const view = doc.defaultView;
	if (box === doc.body || box === doc.documentElement || view === null) return null;
	if (box.scrollTop === 0 && box.scrollLeft === 0) return null;
	const at = Array.from(box.children).find(
		(child) => /^(static|relative)$/.test(view.getComputedStyle(child).position) && child.getClientRects().length > 0,
	);
	return at === undefined ? null : { top: box.scrollTop, left: box.scrollLeft, at };
}

/** what the element is now rather than what it was authored as: typed values, chosen sources, drawn canvases */
function live(el: Element, a: Record<string, string>, ctx: Context): void {
	switch (el.localName) {
		case "input": {
			const input = el as HTMLInputElement;
			if (input.type === "checkbox" || input.type === "radio") {
				if (input.checked) a.checked = "";
				else delete a.checked;
			} else if (input.type !== "password" && input.type !== "file") a.value = input.value;
			break;
		}
		case "option":
			if ((el as HTMLOptionElement).selected) a.selected = "";
			else delete a.selected;
			break;
		case "img": {
			const img = el as HTMLImageElement;
			delete a.loading;
			const src = img.currentSrc || a.src || "";
			if (src.startsWith("blob:")) {
				const drawn = img.complete ? draw(img, img.naturalWidth, img.naturalHeight) : null;
				if (drawn === null) {
					delete a.src;
					ctx.notes.add(NOTE.blob);
				} else a.src = drawn;
				delete a.srcset;
				delete a.sizes;
			} else if (img.currentSrc) {
				a.src = img.currentSrc;
				delete a.srcset;
				delete a.sizes;
			}
			break;
		}
		case "canvas": {
			const url = ctx.opts.drawn?.get(el as HTMLCanvasElement) ?? drawing(el as HTMLCanvasElement, ctx);
			if (url !== null) addStyle(a, `background: url("${url}") 0 0 / 100% 100% no-repeat`);
			break;
		}
		case "video": {
			const video = el as HTMLVideoElement;
			if (stream(video)) {
				delete a.src;
				ctx.notes.add(NOTE.stream);
				break;
			}
			if (video.currentSrc) a.src = video.currentSrc;
			// one playing as it was taken plays in the frame, muted and round; one the hand set playing rests
			const rest = ctx.opts.hovers?.rest.get(el)?.get(":playing");
			if (rest === undefined ? !video.paused && !video.ended : rest !== null) {
				a["data-spool-playing"] = "";
				a.muted = "";
				a.loop = "";
			}
			// one under way shows the frame it was on: the frame runs no script to play it, so it opens there, the poster
			// behind it until it loads
			if (video.currentSrc && video.currentTime > 0) {
				a.src = `${video.currentSrc.replace(/#.*$/, "")}#t=${Math.round(video.currentTime * 1000) / 1000}`;
				a.preload = "auto";
				if (a.poster !== undefined && a.poster !== "")
					addStyle(a, `background: url("${a.poster}") center / ${fitted(el)} no-repeat`);
				delete a.poster;
			}
			break;
		}
		case "iframe":
			delete a.src;
			delete a.srcdoc;
			ctx.notes.add(NOTE.iframe);
			break;
		default: {
			// a player made as a web component (vimeo-video, mux-player) plays in a frame that cannot come: its poster stands in
			const poster = a.poster;
			if (poster === undefined || poster === "" || !el.localName.includes("-")) break;
			addStyle(a, `background: url("${poster}") center / ${fitted(el)} no-repeat`);
		}
	}
}

/** A picture's background size that draws it as the element fits its own: `object-fit` in `background-size` words. */
function fitted(el: Element): string {
	const fit = el.ownerDocument.defaultView?.getComputedStyle(el).objectFit;
	return fit === "cover" ? "cover" : fit === "fill" ? "100% 100%" : "contain";
}

function addStyle(a: Record<string, string>, decl: string): void {
	const own = a.style?.trim().replace(/;$/, "") ?? "";
	a.style = own === "" ? decl : `${own}; ${decl}`;
}

function stream(video: HTMLVideoElement): boolean {
	return video.srcObject !== null || /^(blob|mediastream):/.test(video.currentSrc || video.src);
}

/**
 * What a canvas shows, as an image. A WebGL canvas that does not keep its drawing (most) reads back empty once the
 * frame is on screen, so an empty read is left out with a note rather than sent as a clear picture.
 */
function drawing(canvas: HTMLCanvasElement, ctx: Context): string | null {
	return still(canvas, ctx)?.toDataURL() ?? null;
}

/** a copy of what the canvas shows now, which keeps it when the canvas clears; null for one that shows nothing */
function still(canvas: HTMLCanvasElement, ctx: Context): HTMLCanvasElement | null {
	if (canvas.width === 0 || canvas.height === 0) return null;
	try {
		// read small, averaged down so a thin stroke still counts
		const w = Math.min(canvas.width, 128);
		const h = Math.min(canvas.height, 128);
		const probe = canvas.ownerDocument.createElement("canvas");
		probe.width = w;
		probe.height = h;
		const pen = probe.getContext("2d", { willReadFrequently: true });
		if (pen !== null) pen.imageSmoothingQuality = "high";
		pen?.drawImage(canvas, 0, 0, w, h);
		const pixels = pen?.getImageData(0, 0, w, h).data;
		let seen = false;
		for (let i = 3; pixels !== undefined && i < pixels.length && !seen; i += 4) seen = pixels[i] !== 0;
		if (!seen) {
			ctx.notes.add(NOTE.blank);
			return null;
		}
		const copy = canvas.ownerDocument.createElement("canvas");
		copy.width = canvas.width;
		copy.height = canvas.height;
		copy.getContext("2d")?.drawImage(canvas, 0, 0);
		// a copy of a canvas another site drew can't be read either
		copy.getContext("2d")?.getImageData(0, 0, 1, 1);
		return copy;
	} catch {
		ctx.notes.add(NOTE.canvas);
		return null;
	}
}

/**
 * The canvases in and around a pick that read back drawn, caught over a few frames. A WebGL canvas that keeps no copy of
 * its drawing (most) reads empty except in the frame it was drawn, after the page's own frame callbacks: a resize
 * observer's first call, set up from a frame callback, runs there. A page drawing every frame is caught in the first; one
 * drawing now and then, within `ms`. Only a canvas in sight is waited for: one out of it, a page seldom draws.
 */
export async function readCanvases(root: Element, ms = 500): Promise<Map<HTMLCanvasElement, string>> {
	const doc = root.ownerDocument;
	const view = doc.defaultView;
	const all = Array.from(root.querySelectorAll("canvas"));
	if (root instanceof HTMLCanvasElement) all.unshift(root);
	const pending = new Set(all.filter((c) => c.width > 0 && c.height > 0));
	const copies = new Map<HTMLCanvasElement, HTMLCanvasElement>();
	const out = new Map<HTMLCanvasElement, string>();
	if (view === null) return out;
	const read = () => {
		for (const canvas of pending) {
			const ctx: Context = { base: doc.baseURI, notes: new Set(), anims: new Map(), opts: {} };
			const copy = still(canvas, ctx);
			// one another site drew is never readable; only an empty one is worth another frame
			if (copy !== null || ctx.notes.has(NOTE.canvas)) pending.delete(canvas);
			if (copy !== null) copies.set(canvas, copy);
		}
	};
	read();
	for (const canvas of pending) {
		const r = canvas.getBoundingClientRect();
		if (r.bottom <= 0 || r.right <= 0 || r.top >= view.innerHeight || r.left >= view.innerWidth)
			pending.delete(canvas);
	}
	const until = view.performance.now() + ms;
	while (pending.size > 0 && view.performance.now() < until) {
		await new Promise<void>((done) =>
			view.requestAnimationFrame(() => {
				const mark = doc.createElement("spool-frame");
				doc.documentElement.append(mark);
				const watch = new view.ResizeObserver(() => {
					watch.disconnect();
					mark.remove();
					read();
					done();
				});
				watch.observe(mark);
			}),
		);
	}
	await Promise.all(
		Array.from(copies, async ([canvas, copy]) => {
			const url = await picture(copy);
			if (url !== null) out.set(canvas, url);
		}),
	);
	return out;
}

/**
 * The canvases in and around a pick, in sight, that {@link readCanvases} could not read: a WebGL drawing made once
 * and never again, or another site's. Only what the tab shows still has them.
 */
export function unread(root: Element, drawn: ReadonlyMap<HTMLCanvasElement, string>): HTMLCanvasElement[] {
	const view = root.ownerDocument.defaultView;
	if (view === null) return [];
	const all = Array.from(root.querySelectorAll("canvas"));
	if (root instanceof HTMLCanvasElement) all.unshift(root);
	return all.filter((canvas) => {
		if (drawn.has(canvas) || canvas.width === 0 || canvas.height === 0) return false;
		const r = canvas.getBoundingClientRect();
		return r.bottom > 0 && r.right > 0 && r.top < view.innerHeight && r.left < view.innerWidth;
	});
}

/**
 * The canvases as the tab shows them, everything else hidden for the moment of the shot so none of the page over
 * them is baked in. The part of a canvas out of sight stays clear. `shoot` takes the tab's picture, as a data URL.
 */
export async function shotCanvases(
	canvases: HTMLCanvasElement[],
	shoot: () => Promise<string | null>,
): Promise<Map<HTMLCanvasElement, string>> {
	const out = new Map<HTMLCanvasElement, string>();
	const doc = canvases[0]?.ownerDocument;
	const view = doc?.defaultView;
	if (doc === undefined || view === null || view === undefined) return out;
	const kept: Element[] = [];
	for (const canvas of canvases)
		for (let el: Element | null = canvas; el !== null; el = el.parentElement) {
			el.setAttribute("data-spool-shot", "");
			kept.push(el);
		}
	const hide = doc.createElement("style");
	hide.textContent = "* { visibility: hidden !important } [data-spool-shot] { visibility: visible !important }";
	doc.head.append(hide);
	const frame = () => new Promise<void>((done) => view.requestAnimationFrame(() => done()));
	let url: string | null = null;
	try {
		await frame();
		await frame();
		url = await shoot();
	} finally {
		hide.remove();
		for (const el of kept) el.removeAttribute("data-spool-shot");
	}
	if (url === null) return out;
	const shot = new view.Image();
	shot.src = url;
	await shot.decode().catch(() => {});
	if (shot.naturalWidth === 0) return out;
	// the shot is in the screen's pixels: the canvas's place on it, scaled
	const scale = shot.naturalWidth / view.innerWidth;
	await Promise.all(
		canvases.map(async (canvas) => {
			const r = canvas.getBoundingClientRect();
			const left = Math.max(r.left, 0);
			const top = Math.max(r.top, 0);
			const w = Math.min(r.right, view.innerWidth) - left;
			const h = Math.min(r.bottom, view.innerHeight) - top;
			const copy = doc.createElement("canvas");
			copy.width = Math.round(r.width * scale);
			copy.height = Math.round(r.height * scale);
			copy
				.getContext("2d")
				?.drawImage(
					shot,
					left * scale,
					top * scale,
					w * scale,
					h * scale,
					(left - r.left) * scale,
					(top - r.top) * scale,
					w * scale,
					h * scale,
				);
			const picked = await picture(copy);
			if (picked !== null) out.set(canvas, picked);
		}),
	);
	return out;
}

function draw(img: HTMLImageElement, w: number, h: number): string | null {
	try {
		const c = img.ownerDocument.createElement("canvas");
		c.width = w;
		c.height = h;
		c.getContext("2d")?.drawImage(img, 0, 0);
		return c.toDataURL();
	} catch {
		return null;
	}
}

/**
 * A canvas as an image to send, made off the page's main thread: WebP, which keeps its transparency at a tenth of a
 * PNG's weight (a retina hero drawn in WebGL is megabytes as a PNG, and as long to make in the tab), or a PNG where the
 * browser makes no WebP.
 */
async function picture(canvas: HTMLCanvasElement): Promise<string | null> {
	const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", 0.9));
	if (blob === null) return null;
	const url = await new Promise<string | null>((done) => {
		const reader = new FileReader();
		reader.onload = () => done(typeof reader.result === "string" ? reader.result : null);
		reader.onerror = () => done(null);
		reader.readAsDataURL(blob);
	});
	return url?.startsWith("data:image/webp") ? url : canvas.toDataURL();
}

function text(s: string): string {
	return s.replace(/[&<>\u00a0]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&nbsp;"));
}

function attr(s: string): string {
	return s.replace(/[&"\u00a0]/g, (c) => (c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&nbsp;"));
}

function absolute(url: string, base: string): string {
	try {
		return new URL(url.trim(), base).href;
	} catch {
		return url;
	}
}

function srcset(value: string, base: string): string {
	return value
		.split(",")
		.map((part) => {
			const [url = "", ...rest] = part.trim().split(/\s+/);
			return [absolute(url, base), ...rest].join(" ");
		})
		.join(", ");
}

/** url()s made absolute, for CSS that leaves its document: inline styles and a shadow root's sheets */
export function cssUrls(css: string, base: string): string {
	if (!css.includes("url(")) return css;
	return css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (whole, _q: string, url: string) =>
		url === "" || url.startsWith("data:") || url.startsWith("#") ? whole : `url("${absolute(url, base)}")`,
	);
}

/* ------------------------------------------------------------ the sheets -- */

function readable(sheet: CSSStyleSheet): string | null {
	try {
		return Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
	} catch {
		return null;
	}
}

/** a declaration Chrome serialized with no value, which is never a property's own (a custom property's may be) */
const LOSSY = /(?:^|[\s;{])[a-z][a-z-]*: ;/m;

/** every active stylesheet in document order, `@import`ed ones ahead of the sheet that imports them */
export function styles(doc: Document): ReferenceStyle[] {
	const out: ReferenceStyle[] = [];
	const seen = new Set<CSSStyleSheet>();
	const take = (sheet: CSSStyleSheet, outer?: string) => {
		if (sheet.disabled || seen.has(sheet)) return;
		seen.add(sheet);
		const mediaText = sheet.media?.mediaText || outer || "";
		const media = mediaText === "" ? {} : { media: mediaText };
		let rules: CSSRuleList;
		try {
			rules = sheet.cssRules;
		} catch {
			if (sheet.href !== null) out.push({ kind: "link", href: sheet.href, ...media });
			return;
		}
		const text: string[] = [];
		for (const rule of Array.from(rules)) {
			if ("styleSheet" in rule) {
				const imported = (rule as CSSImportRule).styleSheet;
				if (imported !== null) take(imported, (rule as CSSImportRule).media.mediaText || mediaText);
				continue;
			}
			text.push(rule.cssText);
		}
		const read = text.join("\n");
		// Chrome serializes a shorthand set from a var() and then a longhand of it as its longhands, all empty: the
		// rule is lost unless the sheet is read from its source, the file or the <style>'s own text
		if (LOSSY.test(read)) {
			if (sheet.href !== null) return void out.push({ kind: "link", href: sheet.href, ...media });
			const source = sheet.ownerNode instanceof HTMLStyleElement ? sheet.ownerNode.textContent : null;
			// one that imports holds those sheets too, already taken
			if (source !== null && source.trim() !== "" && !/@import\b/i.test(source))
				return void out.push({ kind: "text", text: source, base: doc.baseURI, ...media });
		}
		if (text.length > 0) out.push({ kind: "text", text: read, base: sheet.href ?? doc.baseURI, ...media });
	};
	for (const sheet of Array.from(doc.styleSheets)) take(sheet);
	for (const sheet of doc.adoptedStyleSheets ?? []) take(sheet);
	return out;
}

/**
 * The files of the readable sheets' @font-face rules the page holds unloaded. A face counts only on that evidence: one
 * the page's font set doesn't show is taken as used, and fetched.
 */
export function unusedFonts(doc: Document): string[] {
	const idle = new Set<string>();
	const loaded = new Set<string>();
	doc.fonts.forEach((face) => {
		const key = faceKey(face.family, face.weight, face.style, face.stretch, face.unicodeRange);
		(face.status === "unloaded" ? idle : loaded).add(key);
	});
	const out = new Set<string>();
	const seen = new Set<CSSStyleSheet>();
	const visit = (rules: CSSRuleList, base: string) => {
		for (const rule of Array.from(rules)) {
			if ("styleSheet" in rule) {
				const imported = (rule as CSSImportRule).styleSheet;
				if (imported !== null) sheet(imported);
			} else if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules, base);
			else if (/^@font-face\b/i.test(rule.cssText)) {
				const s = (rule as CSSFontFaceRule).style;
				const key = faceKey(
					s.getPropertyValue("font-family"),
					s.getPropertyValue("font-weight") || "normal",
					s.getPropertyValue("font-style") || "normal",
					s.getPropertyValue("font-stretch") || "normal",
					s.getPropertyValue("unicode-range") || "U+0-10FFFF",
				);
				if (!idle.has(key) || loaded.has(key)) continue;
				for (const m of s.getPropertyValue("src").matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g)) {
					if (m[2] !== undefined && m[2] !== "" && !m[2].startsWith("data:")) out.add(absolute(m[2], base));
				}
			}
		}
	};
	const sheet = (s: CSSStyleSheet) => {
		if (s.disabled || seen.has(s)) return;
		seen.add(s);
		try {
			visit(s.cssRules, s.href ?? doc.baseURI);
		} catch {
			// a sheet the tab may not read: its faces are fetched
		}
	};
	for (const s of Array.from(doc.styleSheets)) sheet(s);
	for (const s of doc.adoptedStyleSheets ?? []) sheet(s);
	return [...out];
}

function faceKey(family: string, weight: string, style: string, stretch: string, range: string): string {
	const name = family.replace(/["']/g, "").trim();
	return [name, weight, style, stretch, range.toUpperCase().replace(/\s+/g, "")].join("|");
}

/* ------------------------------------------------------------ animations -- */

/**
 * The Web Animations running in the subtree that script started (Framer Motion's, `el.animate()`), as `@keyframes`
 * and a rule on a `data-spool-anim` attribute the markup carries, each resumed where it was. CSS animations and
 * transitions are left alone: the site's sheets bring them.
 */
export function webAnimations(doc: Document, root: Element): { css: string; anims: Map<Element, string> } {
	const anims = new Map<Element, string>();
	const rules = new Map<string, string[]>();
	const frames: string[] = [];
	let n = 0;
	for (const a of doc.getAnimations()) {
		if ("animationName" in a || "transitionProperty" in a) continue;
		const effect = a.effect as KeyframeEffect | null;
		const target = effect?.target ?? null;
		if (effect === null || target === null || typeof effect.getKeyframes !== "function" || !within(root, target))
			continue;
		const name = `spool-anim-${++n}`;
		frames.push(`@keyframes ${name} {\n${keyframes(effect.getKeyframes())}\n}`);
		let id = anims.get(target);
		if (id === undefined) {
			id = `a${anims.size + 1}`;
			anims.set(target, id);
		}
		const selector = `[data-spool-anim="${id}"]${effect.pseudoElement ?? ""}`;
		rules.set(selector, [...(rules.get(selector) ?? []), shorthand(a, effect, name)]);
	}
	const css = [
		...frames,
		...Array.from(rules, ([selector, list]) => `${selector} { animation: ${list.join(", ")} !important; }`),
	];
	return { css: css.join("\n"), anims };
}

function within(root: Element, node: Element): boolean {
	let n: Node | null = node;
	while (n !== null) {
		if (root.contains(n)) return true;
		const r = n.getRootNode();
		n = r instanceof ShadowRoot ? r.host : null;
	}
	return false;
}

const NOT_PROPS = new Set(["offset", "computedOffset", "easing", "composite"]);

function keyframes(list: ComputedKeyframe[]): string {
	return list
		.map((f) => {
			const decl: string[] = [];
			for (const [k, v] of Object.entries(f)) {
				if (NOT_PROPS.has(k) || v === null || v === undefined || v === "") continue;
				decl.push(`${property(k)}: ${v}`);
			}
			if (f.easing !== undefined && f.easing !== "linear") decl.push(`animation-timing-function: ${f.easing}`);
			const at = Math.round((f.computedOffset ?? f.offset ?? 0) * 100000) / 1000;
			return `  ${at}% { ${decl.join("; ")} }`;
		})
		.join("\n");
}

function property(k: string): string {
	if (k.startsWith("--")) return k;
	if (k === "cssFloat") return "float";
	if (k === "cssOffset") return "offset";
	return k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

function shorthand(a: Animation, effect: KeyframeEffect, name: string): string {
	const t = effect.getTiming();
	const rate = Math.abs(a.playbackRate) || 1;
	const duration = (typeof t.duration === "number" ? t.duration : 0) / rate;
	const delay = (t.delay ?? 0) / rate;
	const local = (effect.getComputedTiming().localTime ?? 0) as number;
	const iterations = t.iterations === Number.POSITIVE_INFINITY ? "infinite" : String(t.iterations ?? 1);
	const fill = t.fill === undefined || t.fill === "auto" ? "none" : t.fill;
	const state = a.playState === "paused" ? "paused" : "running";
	return [
		name,
		`${round(duration)}ms`,
		t.easing ?? "linear",
		// resumed where it was: the delay that puts it at its current time now
		`${round(delay - local / rate)}ms`,
		iterations,
		t.direction ?? "normal",
		fill,
		state,
	].join(" ");
}

const round = (x: number) => Math.round(x * 100) / 100;

/* -------------------------------------------------------------- backdrop -- */

/** the colour the element sat on, when its own background lets it through */
/**
 * What keeps the picked element's top edge where its content starts once its ancestors are flattened in the frame,
 * which puts it in plain block flow at the top. On the page a first child's top margin either collapsed through the
 * element and sat above it (taken back here, or it would push the element down the frame) or stayed inside it, as
 * in a flex or grid item (kept inside, the element made the formatting root it was).
 */
export function standAlone(el: Element): string[] {
	const view = el.ownerDocument.defaultView;
	const parent = el.parentElement;
	if (view === null || parent === null) return [];
	const own = view.getComputedStyle(el);
	if (own.display !== "block") return [];
	if (/(?:^|-)(?:flex|grid)$/.test(view.getComputedStyle(parent).display)) return ["display: flow-root !important"];
	let above = 0;
	let below = 0;
	for (let box = el, style = own; letsMarginThrough(style); ) {
		const child = firstInFlow(box, view);
		if (child === null) break;
		box = child;
		style = view.getComputedStyle(child);
		const m = Number.parseFloat(style.marginTop) || 0;
		above = Math.max(above, m);
		below = Math.min(below, m);
	}
	const escaped = above + below;
	return escaped === 0 ? [] : [`margin-top: ${-Math.round(escaped * 100) / 100}px !important`];
}

/** a block whose top margin and its first child's are one: no top padding or border, not a formatting root */
function letsMarginThrough(s: CSSStyleDeclaration): boolean {
	return (
		(s.display === "block" || s.display === "list-item") &&
		(s.overflowY === "visible" || s.overflowY === "clip") &&
		(Number.parseFloat(s.paddingTop) || 0) === 0 &&
		(Number.parseFloat(s.borderTopWidth) || 0) === 0 &&
		!/layout|paint|strict|content/.test(s.contain) &&
		s.columnCount === "auto"
	);
}

/** the first child in the flow, past the ones taken out of it; none when words come first */
function firstInFlow(box: Element, view: Window): Element | null {
	for (let n = box.firstChild; n !== null; n = n.nextSibling) {
		if (n.nodeType === 3 && (n as Text).data.trim() !== "") return null;
		if (n.nodeType !== 1) continue;
		const s = view.getComputedStyle(n as Element);
		if (s.display === "none" || s.position === "absolute" || s.position === "fixed" || s.float !== "none") continue;
		// a block-level child's margin joins in; a line's does not
		return /^(?:block|list-item|flex|grid|table|flow-root)$/.test(s.display) ? (n as Element) : null;
	}
	return null;
}

function backdropOf(el: Element): string | undefined {
	const view = el.ownerDocument.defaultView;
	if (view === null) return undefined;
	if (!clear(view.getComputedStyle(el).backgroundColor)) return undefined;
	for (let p = el.parentElement; p !== null; p = p.parentElement) {
		const bg = view.getComputedStyle(p).backgroundColor;
		if (!clear(bg)) return bg;
	}
	return undefined;
}

function clear(color: string): boolean {
	return color === "" || color === "transparent" || /,\s*0\)$|\/\s*0\)$/.test(color);
}
