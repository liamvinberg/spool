import { isAssetUrl } from "../../daemon/assets";
import { FORBIDDEN_ELEMENTS, safeImageReference, URL_ATTRIBUTES, unsafeCaptureCss } from "./capture-safety";
import { deliverFramesForCapture } from "./freeze";
import { nativeFetch, nativeRaf } from "./natives";
import { atFullDensity, realDevicePixelRatio } from "./resolution";
import { settle } from "./settle";

/**
 * An export's source (#174): this frame as a sanitized SVG foreignObject, for
 * the trusted capture worker to rasterize off this frame's main thread. The
 * frame waits out its own fonts and entry animations first, and carries the
 * faces it loaded in as data URIs, because the isolated rasterization loads no
 * external resources.
 */

declare const scheduler: { yield?: () => Promise<void> } | undefined;

function yieldCaptureTask(): Promise<void> {
	if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") return scheduler.yield();
	return new Promise((resolve) => setTimeout(resolve, 0));
}

// The characters this document actually shows — a face whose unicode-range
// covers none of them is bytes nobody would ever see. Large authored text
// is scanned in its own tasks, each bounded by time rather than length, and
// node by node rather than as one copied string, so font subsetting cannot
// stall its renderer however slowly a busy machine runs the scan.
async function documentCodepoints(root: Node): Promise<Set<number>> {
	const seen = new Set<number>();
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	// a pair split across two text nodes is still one character, as in textContent
	let pending = "";
	await yieldCaptureTask();
	let taskStart = performance.now();
	while (walker.nextNode()) {
		const data = (walker.currentNode as Text).data;
		const text = pending === "" ? data : pending + data;
		pending = "";
		let index = 0;
		while (index < text.length) {
			const end = Math.min(text.length, index + 4 * 1024);
			while (index < end) {
				const code = text.codePointAt(index) as number;
				if (code >= 0xd800 && code <= 0xdbff && index === text.length - 1) {
					pending = text[index] as string;
					index += 1;
					break;
				}
				seen.add(code);
				index += code > 0xffff ? 2 : 1;
			}
			if (performance.now() - taskStart > 4) {
				await yieldCaptureTask();
				taskStart = performance.now();
			}
		}
	}
	if (pending !== "") seen.add(pending.charCodeAt(0));
	return seen;
}

// "U+0-10FFFF", "U+0102-0103", "U+30??" — any spelling, one question:
// does this face carry a character on the page?
function rangeWanted(spec: string, codes: ReadonlySet<number>): boolean {
	if (!spec) return true;
	for (const part of spec.split(",")) {
		const token = part.trim().replace(/^u\+/i, "");
		if (token === "") continue;
		let lo: number;
		let hi: number;
		if (token.indexOf("?") >= 0) {
			lo = parseInt(token.replace(/\?/g, "0"), 16);
			hi = parseInt(token.replace(/\?/g, "F"), 16);
		} else {
			const ends = token.split("-");
			lo = parseInt(ends[0] as string, 16);
			hi = ends.length > 1 ? parseInt(ends[1] as string, 16) : lo;
		}
		if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
		for (const code of codes) if (code >= lo && code <= hi) return true;
	}
	return false;
}

function bareFamily(name: string): string {
	return String(name || "")
		.trim()
		.replace(/^["']|["']$/g, "")
		.toLowerCase();
}

function readAsDataUrl(blob: Blob, failure: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () => reject(reader.error || new Error(failure));
		reader.readAsDataURL(blob);
	});
}

const fontDataUrls = new Map<string, Promise<string>>();
async function asDataUrl(url: string): Promise<string> {
	let held = fontDataUrls.get(url);
	if (held === undefined) {
		held = nativeFetch(url)
			.then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
			.then((blob) => readAsDataUrl(blob, "font read failed"));
		fontDataUrls.set(url, held);
		held.catch(() => fontDataUrls.delete(url));
	}
	return held;
}

/**
 * The fonts a still can actually draw. An SVG foreignObject rasterized
 * through an <img> loads nothing external, so every webface would fall back
 * to a system font and the text would rewrap under its own headings. The
 * faces the document really loaded go in as data URIs instead — only those,
 * and only the subsets its characters need, because a whole family is
 * megabytes and a still is a placeholder.
 */
async function inlineFontFaces(root: Node): Promise<string> {
	const loaded = new Set<string>();
	try {
		for (const face of document.fonts) if (face.status === "loaded") loaded.add(bareFamily(face.family));
	} catch {}
	if (loaded.size === 0) return "";
	const candidates: Array<{
		family: string;
		style: string;
		weight: string;
		stretch: string;
		variations: string;
		range: string;
		url: string;
	}> = [];
	for (const sheet of Array.from(document.styleSheets)) {
		let rules: CSSRuleList;
		// a stylesheet this document cannot read has nothing to give
		try {
			rules = sheet.cssRules;
		} catch {
			continue;
		}
		for (const rule of Array.from(rules || [])) {
			if (rule.constructor.name !== "CSSFontFaceRule" && rule.type !== 5) continue;
			// the font descriptors, read through the rule's declaration block
			const style = (rule as CSSFontFaceRule).style as CSSStyleDeclaration & {
				src?: string;
				unicodeRange?: string;
			};
			if (!loaded.has(bareFamily(style.fontFamily))) continue;
			const range = style.unicodeRange || "";
			const url = (/url\(\s*["']?([^"')]+)["']?\s*\)/.exec(style.src || "") || [])[1];
			if (!url || url.slice(0, 5) === "data:") continue;
			candidates.push({
				family: style.fontFamily,
				style: style.fontStyle || "normal",
				weight: style.fontWeight || "400",
				stretch: style.fontStretch || "",
				variations: style.fontVariationSettings || "",
				range,
				url,
			});
		}
	}
	const codes = await documentCodepoints(root);
	const wanted = candidates.filter((face) => rangeWanted(face.range, codes));
	const inlined = await Promise.all(wanted.map((face) => asDataUrl(face.url).catch(() => undefined)));
	let css = "";
	wanted.forEach((face, i) => {
		const data = inlined[i];
		if (data === undefined) return;
		css +=
			"@font-face{font-family:" +
			face.family +
			";font-style:" +
			face.style +
			";font-weight:" +
			face.weight +
			(face.stretch ? `;font-stretch:${face.stretch}` : "") +
			(face.variations ? `;font-variation-settings:${face.variations}` : "") +
			";font-display:block;src:url(" +
			data +
			")" +
			(face.range ? `;unicode-range:${face.range}` : "") +
			"}";
	});
	return css;
}

/** How much of a still's source its images may take, leaving the rest of it to the document itself. */
const ASSET_BUDGET_CHARS = 12 * 1024 * 1024;

/** The most pixels a redrawn image is kept lossless at. */
const LOSSLESS_PIXELS = 1024 * 1024;

const assetDataUrls = new Map<string, Promise<string>>();
/** An asset's own bytes, as a data URL: what a CSS url() names, which no element shows at one size. */
function assetDataUrl(url: string): Promise<string> {
	let held = assetDataUrls.get(url);
	if (held === undefined) {
		held = nativeFetch(url, { mode: "cors", credentials: "omit" })
			.then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
			.then((blob) =>
				blob.size > ASSET_BUDGET_CHARS
					? Promise.reject(new Error("asset too large"))
					: readAsDataUrl(blob, "asset read failed"),
			);
		assetDataUrls.set(url, held);
		held.catch(() => assetDataUrls.delete(url));
	}
	return held;
}

/**
 * A shown image redrawn at the size it is shown, at the still's density, as a
 * data URL: a still needs no more of an original than it shows, and an
 * original can be bigger than a whole still may be. Drawn now, encoded later;
 * nothing when it hasn't loaded or can't be read back (one loaded without CORS).
 */
function shownImage(image: HTMLImageElement): Promise<string> | undefined {
	const { naturalWidth, naturalHeight } = image;
	if (!image.complete || naturalWidth === 0 || naturalHeight === 0) return undefined;
	const dpr = Math.min(realDevicePixelRatio(), 2);
	// enough for the box however the image fits it, never more than it has
	const scale = Math.min(
		1,
		Math.max((image.clientWidth * dpr) / naturalWidth, (image.clientHeight * dpr) / naturalHeight),
	);
	if (!(scale > 0)) return undefined;
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(naturalWidth * scale));
	canvas.height = Math.max(1, Math.round(naturalHeight * scale));
	const context = canvas.getContext("2d");
	if (context === null) return undefined;
	try {
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		context.getImageData(0, 0, 1, 1);
	} catch {
		return undefined;
	}
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) readAsDataUrl(blob, "image read failed").then(resolve, reject);
				else reject(new Error("image encoding failed"));
			},
			// lossless while small, as an icon or a graphic is; a photo-sized one lossy, or one would fill a still
			canvas.width * canvas.height <= LOSSLESS_PIXELS ? "image/png" : "image/webp",
			0.92,
		);
	});
}

const CSS_URL = /url\(\s*(["']?)([^"')]+)\1\s*\)/gi;

/**
 * The frame's own images in the still (#216). Imported images load from the
 * render host by URL, and the isolated rasterization loads nothing, so each
 * one the clone names becomes a data URL: an image (the candidate the live one
 * chose from its srcset) redrawn at the size it is shown, and the bytes the
 * shim fetched itself, as it does fonts, of an SVG image's href and a url() in
 * a style attribute or a style element. Read from the clone as it was cloned,
 * before any await. The images together stay inside a still's size: one that
 * would not fit, or fails to arrive, is left for the sanitizer to drop.
 */
function inlineAssetImages(clone: Element): Promise<void> {
	const base = document.baseURI;
	const asset = (value: string | null): value is string => value !== null && isAssetUrl(value.trim(), base);
	const fetched = (url: string) => assetDataUrl(new URL(url.trim(), base).href);
	const edits: Array<{ data: Promise<string>; apply: (data: string) => void }> = [];
	const live = document.querySelectorAll("img");
	const drawn = new Map<string, Promise<string> | undefined>();
	clone.querySelectorAll("img").forEach((copy, index) => {
		const image = live[index];
		const shown = image?.currentSrc || copy.getAttribute("src");
		if (!asset(shown)) return;
		// the same image at the same size is drawn once, however often it is shown
		const key = image === undefined ? "" : `${shown}\0${image.clientWidth}\0${image.clientHeight}`;
		if (image !== undefined && !drawn.has(key)) drawn.set(key, shownImage(image));
		const data = drawn.get(key) ?? fetched(shown);
		edits.push({
			data,
			apply: (data) => {
				copy.removeAttribute("srcset");
				copy.setAttribute("src", data);
			},
		});
	});
	for (const image of clone.querySelectorAll("image")) {
		for (const name of ["href", "xlink:href"]) {
			const value = image.getAttribute(name);
			if (asset(value)) edits.push({ data: fetched(value), apply: (data) => image.setAttribute(name, data) });
		}
	}
	const inCss = (css: string, write: (css: string) => void): void => {
		const urls = [...css.matchAll(CSS_URL)].map((match) => match[2] as string).filter(asset);
		if (urls.length === 0) return;
		let rewritten = css;
		for (const url of new Set(urls)) {
			edits.push({
				data: fetched(url),
				apply: (data) => {
					rewritten = rewritten.replace(CSS_URL, (whole, _quote, target: string) =>
						target === url ? `url("${data}")` : whole,
					);
					write(rewritten);
				},
			});
		}
	};
	for (const element of clone.querySelectorAll("[style]")) {
		inCss(element.getAttribute("style") || "", (css) => element.setAttribute("style", css));
	}
	for (const style of clone.querySelectorAll("style")) {
		inCss(style.textContent || "", (css) => {
			style.textContent = css;
		});
	}
	return Promise.all(edits.map(({ data }) => data.catch(() => undefined))).then((arrived) => {
		let spent = 0;
		arrived.forEach((data, index) => {
			if (data === undefined || spent + data.length > ASSET_BUDGET_CHARS) return;
			spent += data.length;
			edits[index]?.apply(data);
		});
	});
}

function sanitizeCaptureClone(clone: Element): void {
	for (const element of clone.querySelectorAll(FORBIDDEN_ELEMENTS.join(", "))) {
		element.remove();
	}
	for (const style of clone.querySelectorAll("style")) {
		const css = style.textContent || "";
		if (!unsafeCaptureCss(css)) continue;
		const rewritten = rewriteCaptureStyle(css);
		if (rewritten === null) style.remove();
		else style.textContent = rewritten;
	}
	for (const element of clone.querySelectorAll("*")) {
		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name.toLowerCase();
			if (name.startsWith("on") || unsafeCaptureCss(attribute.value)) {
				element.removeAttribute(attribute.name);
				continue;
			}
			if (!URL_ATTRIBUTES.has(name)) continue;
			const value = attribute.value.trim();
			if (
				value === "" ||
				value.startsWith("#") ||
				safeImageReference(element.localName.toLowerCase(), name, value)
			) {
				continue;
			}
			element.removeAttribute(attribute.name);
		}
	}
}

function rewriteCaptureStyle(value: string): string | null {
	// replaceSync drops @import rules in both quoted and url() forms. Keep
	// the rest of the sheet: a font import must not erase the frame's layout.
	const sheet = new CSSStyleSheet();
	try {
		sheet.replaceSync(value);
	} catch {
		return null;
	}
	stripUnsafeCaptureRules(sheet);
	const rewritten = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
	return unsafeCaptureCss(rewritten) ? null : rewritten;
}

function stripUnsafeCaptureRules(parent: CSSStyleSheet | CSSGroupingRule): void {
	for (let index = parent.cssRules.length - 1; index >= 0; index--) {
		const rule = parent.cssRules[index] as CSSRule & { cssRules?: CSSRuleList; style?: CSSStyleDeclaration };
		if (rule.cssRules) stripUnsafeCaptureRules(rule as CSSGroupingRule);
		stripUnsafeCaptureDeclarations(rule);
		if (unsafeCaptureCss(rule.cssText)) parent.deleteRule(index);
	}
}

function stripUnsafeCaptureDeclarations(rule: { style?: CSSStyleDeclaration }): void {
	if (!rule.style) return;
	for (const property of Array.from(rule.style)) {
		const declaration = `${property}:${rule.style.getPropertyValue(property)}`;
		if (unsafeCaptureCss(declaration)) rule.style.removeProperty(property);
	}
}

// A copied DOM has no animation timeline. Preserve its current painted values.
function snapshotAnimations(clone: Element): void {
	const animations = document.getAnimations();
	if (animations.length === 0) return;
	const originals = [document.documentElement, ...document.documentElement.querySelectorAll("*")];
	const copies = [clone, ...clone.querySelectorAll("*")];
	const indices = new Map<Element, number>(originals.map((element, index) => [element, index]));
	const pseudoRules: string[] = [];
	for (const animation of animations) {
		const effect = animation.effect;
		if (!(effect instanceof KeyframeEffect) || !effect.target) continue;
		const index = indices.get(effect.target) as number;
		const copy = copies[index] as (Element & { style?: CSSStyleDeclaration }) | undefined;
		if (!copy) continue;
		const pseudo = effect.pseudoElement;
		const computed = getComputedStyle(effect.target, pseudo);
		const style = pseudo ? document.createElement("span").style : copy.style;
		if (!style) continue;
		for (const keyframe of effect.getKeyframes()) {
			for (const key of Object.keys(keyframe)) {
				if (["offset", "computedOffset", "easing", "composite"].includes(key)) continue;
				const property = key.startsWith("--") ? key : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
				style.setProperty(property, computed.getPropertyValue(property), "important");
			}
		}
		style.setProperty("animation", "none", "important");
		style.setProperty("transition", "none", "important");
		if (pseudo) {
			copy.setAttribute("data-spool-capture-animation", String(index));
			pseudoRules.push(`[data-spool-capture-animation="${index}"]${pseudo}{${style.cssText}}`);
		}
	}
	if (pseudoRules.length > 0) {
		const style = document.createElement("style");
		style.textContent = pseudoRules.join("\n");
		clone.appendChild(style);
	}
}

export function captureSource(settleMs: number): Promise<{ svg: Blob; width: number; height: number; dpr: number }> {
	// at the screen's density, whatever the zoom the frame was shown at (resolution.ts)
	return atFullDensity(() => captureAtDensity(settleMs));
}

async function captureAtDensity(settleMs: number): Promise<{ svg: Blob; width: number; height: number; dpr: number }> {
	const stopFrames = deliverFramesForCapture();
	try {
		await settle(settleMs, nativeRaf);
	} finally {
		stopFrames();
	}
	const W = document.documentElement.clientWidth || innerWidth;
	const H = document.documentElement.clientHeight || innerHeight;
	if (!Number.isInteger(W) || W <= 0 || !Number.isInteger(H) || H <= 0) {
		throw new Error("invalid capture dimensions");
	}
	// All live canvases start encoding in one task for a coherent snapshot.
	// Bound their count/pixels first so that batch cannot create an arbitrary
	// heap spike; bound the cloned tree before allocating its duplicate too.
	const nodeWalker = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
	let nodeCount = 0;
	while (nodeWalker.nextNode()) {
		nodeCount += 1;
		if (nodeCount > 50000) throw new Error("capture document too large");
	}
	const srcCanvas = document.querySelectorAll("canvas");
	if (srcCanvas.length > 32) throw new Error("too many capture canvases");
	let sourceCanvasPixels = 0;
	for (const canvas of srcCanvas) {
		sourceCanvasPixels += canvas.width * canvas.height;
		if (!Number.isSafeInteger(sourceCanvasPixels) || sourceCanvasPixels > 16 * 1024 * 1024) {
			throw new Error("capture canvases too large");
		}
	}
	const canvasDataUrl = (canvas: HTMLCanvasElement): Promise<string> =>
		new Promise((resolve, reject) => {
			canvas.toBlob((blob) => {
				if (blob) readAsDataUrl(blob, "blob read failed").then(resolve, reject);
				else reject(new Error("canvas blob encoding failed"));
			}, "image/png");
		});
	const canvasSnapshots = Array.from(srcCanvas, (canvas) => ({
		width: canvas.clientWidth,
		height: canvas.clientHeight,
	}));
	const canvasUrlsPromise = Promise.all(Array.from(srcCanvas, (canvas) => canvasDataUrl(canvas)));
	const clone = document.documentElement.cloneNode(true) as HTMLElement;
	clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
	// Animation timelines are not cloned. Bake only their affected properties
	// into the snapshot before any await can advance the live document.
	snapshotAnimations(clone);
	const srcInputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
	const dstInputs = clone.querySelectorAll("input, textarea");
	srcInputs.forEach((el, i) => {
		const d = dstInputs[i];
		if (d) d.setAttribute("value", el.value);
	});
	const fontCssPromise = inlineFontFaces(clone);
	const assetsPromise = inlineAssetImages(clone);
	const [canvasUrls, fontCss] = await Promise.all([canvasUrlsPromise, fontCssPromise, assetsPromise]);
	// Cached font promises and canvas encodes may resolve in this same task.
	// Give the renderer a paint before sanitizing and serializing the clone.
	await yieldCaptureTask();
	const dstCanvas = clone.querySelectorAll("canvas");
	for (let i = 0; i < srcCanvas.length; i++) {
		const d = dstCanvas[i];
		const snapshot = canvasSnapshots[i] as { width: number; height: number };
		if (!d?.parentNode) continue;
		const img = document.createElement("img");
		img.setAttribute("src", canvasUrls[i] as string);
		// Keep the class and id selectors that position the live canvas,
		// just as its inline style is kept below.
		for (const attribute of ["class", "id"]) {
			const value = d.getAttribute(attribute);
			if (value !== null) img.setAttribute(attribute, value);
		}
		img.setAttribute(
			"style",
			`${d.getAttribute("style") || ""};width:${snapshot.width}px;height:${snapshot.height}px`,
		);
		d.parentNode.replaceChild(img, d);
	}
	sanitizeCaptureClone(clone);
	// The sanitizer removes authored resource URLs first. Only then add the
	// loaded faces the shim fetched itself, as bounded data-font URLs.
	if (fontCss !== "") {
		const style = document.createElement("style");
		style.textContent = fontCss;
		(clone.querySelector("head") || clone).appendChild(style);
	}
	const xml = new XMLSerializer().serializeToString(clone);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
		`<foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
	// An export is lossless and full-size, at the density the frame is shown.
	const dpr = Math.min(realDevicePixelRatio(), 2);
	const source = new Blob([svg], { type: "image/svg+xml" });
	if (source.size > 16 * 1024 * 1024) throw new Error("capture source too large");
	return { svg: source, width: W, height: H, dpr };
}
