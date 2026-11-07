import type { ReferenceCapture, ReferenceStyle } from "../../src/reference-wire";

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
	iframe: "Embedded pages (iframes) are left out.",
	stream: "Video streams are left out; their posters came.",
	canvas: "A canvas drawn from another site could not be read.",
	blob: "Images made in the page (blob: URLs) could not come.",
	closed: "Closed shadow roots are left out.",
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
		for (const a of chain) out.push(open(a, ctx, { contents: true }));
		element(el, out, ctx, false, true);
		for (const a of chain.reverse()) out.push(`</${a.localName}>`);
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
	live(el, a, ctx);
	if (how.contents === true) addStyle(a, "display: contents !important");
	if (how.picked === true) a["data-spool-reference"] = "";
	const anim = ctx.anims.get(el);
	if (anim !== undefined) a["data-spool-anim"] = anim;
	let s = `<${tag}`;
	for (const name in a) s += a[name] === "" ? ` ${name}` : ` ${name}="${attr(a[name] ?? "")}"`;
	return `${s}>`;
}

function attributes(el: Element, ctx: Context): Record<string, string> {
	const a: Record<string, string> = {};
	for (const at of Array.from(el.attributes)) {
		const name = at.name;
		const lower = name.toLowerCase();
		if (lower.startsWith("on")) continue;
		let value = at.value;
		if (URL_ATTRS.has(lower)) {
			if (/^\s*javascript:/i.test(value)) continue;
			if (value !== "" && !value.startsWith("#")) value = absolute(value, ctx.base);
		} else if (lower === "style") value = cssUrls(value, ctx.base);
		else if (lower === "srcset" || lower === "imagesrcset") value = srcset(value, ctx.base);
		a[name] = value;
	}
	return a;
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
			const canvas = el as HTMLCanvasElement;
			let url: string | null = null;
			try {
				url = canvas.width > 0 && canvas.height > 0 ? canvas.toDataURL() : null;
			} catch {
				ctx.notes.add(NOTE.canvas);
			}
			if (url !== null) {
				addStyle(a, `background: url("${url}") 0 0 / 100% 100% no-repeat`);
			}
			break;
		}
		case "video": {
			const video = el as HTMLVideoElement;
			if (stream(video)) {
				delete a.src;
				ctx.notes.add(NOTE.stream);
			} else if (video.currentSrc) a.src = video.currentSrc;
			break;
		}
		case "iframe":
			delete a.src;
			delete a.srcdoc;
			ctx.notes.add(NOTE.iframe);
			break;
	}
}

function addStyle(a: Record<string, string>, decl: string): void {
	const own = a.style?.trim().replace(/;$/, "") ?? "";
	a.style = own === "" ? decl : `${own}; ${decl}`;
}

function stream(video: HTMLVideoElement): boolean {
	return video.srcObject !== null || /^(blob|mediastream):/.test(video.currentSrc || video.src);
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
		if (text.length > 0) out.push({ kind: "text", text: text.join("\n"), base: sheet.href ?? doc.baseURI, ...media });
	};
	for (const sheet of Array.from(doc.styleSheets)) take(sheet);
	for (const sheet of doc.adoptedStyleSheets ?? []) take(sheet);
	return out;
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
