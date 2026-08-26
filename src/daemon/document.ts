import { createHash } from "node:crypto";
import { COVER_DEVICE_SCALE, COVER_QUALITY, LIVE_MIN_CSS_PX, MAX_CAPTURE_OUTPUT_PIXELS } from "../cover";
import { CAPTURE_IMAGE_TYPES } from "./assets";

/**
 * Assembly of the served frame document. Spool owns the whole page (#16):
 * frames carry zero boilerplate, so everything a component needs to render —
 * finished CSS, fonts, import map, boot module — is injected here, inline,
 * as one sealed sandboxable document.
 */

export interface FrameDocumentParts {
	project: string;
	frame: string;
	projectCapability: string;
	controlOrigin: string;
	/** Compiled Tailwind output: theme vars, preflight, used utilities. */
	css: string;
	/** shared/fonts.css verbatim, when the file exists. */
	fonts?: string | undefined;
	/** Extra stylesheet emitted by the frame bundle (plain .css imports). */
	bundledCss?: string | undefined;
	importMap: object;
	bootJs: string;
}

const captureWorkerJs = `(() => {
	const BOOTSTRAP = "spool-capture-bootstrap-v1";
	const RASTER = "spool-capture-raster-v1";
	const RESULT = "spool-capture-result-v1";
	const MAX_SOURCE_BYTES = 16 * 1024 * 1024;
	const MAX_SVG_CHARS = 16 * 1024 * 1024;
	const MAX_SOURCE_EDGE = 32 * 1024;
	const MAX_SVG_NODES = 50002;
	const MAX_CAPTURE_OUTPUT_PIXELS = ${MAX_CAPTURE_OUTPUT_PIXELS};
	const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
	const REQUEST_ID = /^[0-9a-f]{32}$/;
	const SAFE_FONT_DATA_URL = /^data:font\\/(?:otf|ttf|woff2?);base64,[a-z0-9+/]+={0,2}$/i;
	const SAFE_IMAGE_DATA_URL = /^data:image\\/(?:${CAPTURE_IMAGE_TYPES});base64,[a-z0-9+/]+={0,2}$/i;
	const SAFE_IMAGE_SRC_PREFIX = /^data:image\\/(?:${CAPTURE_IMAGE_TYPES});base64,/i;
	const expectedParentOrigin = document.querySelector('meta[name="spool-control-origin"]')?.content;
	const URL_ATTRIBUTES = new Set([
		"action", "background", "cite", "data", "formaction", "href",
		"poster", "src", "srcset", "xlink:href"
	]);
	const FORBIDDEN_ELEMENTS = new Set([
		"audio", "base", "embed", "frame", "iframe", "link", "meta",
		"object", "script", "source", "track", "video"
	]);

	function record(value) {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	}

	function exactKeys(value, expected) {
		const keys = Object.keys(value).sort();
		return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
	}

	function safeRequestId(value) {
		return typeof value === "string" && REQUEST_ID.test(value);
	}

	function unsafeCss(value) {
		const normalized = value
			.replace(/\\\\([0-9a-f]{1,6})\\s?/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
			.replace(/\\\\([^\\n\\r\\f])/g, "$1");
		if (/@import/i.test(normalized)) return true;
		let unsafe = false;
		const remainder = normalized.replace(/url\\s*\\(\\s*([^)]*)\\)/gi, (_match, raw) => {
			let target = raw.trim();
			if (
				(target.startsWith('"') && target.endsWith('"')) ||
				(target.startsWith("'") && target.endsWith("'"))
			) {
				target = target.slice(1, -1).trim();
			}
			const safeFragment = /^#[^\\s"'()]+$/.test(target);
			const safeFont = target.length <= MAX_SOURCE_BYTES && SAFE_FONT_DATA_URL.test(target);
			// A project asset rides in the document as a bounded base64 image (#101),
			// so background-image and every other url() image reaches a still.
			const safeImage = target.length <= MAX_SOURCE_BYTES && SAFE_IMAGE_DATA_URL.test(target);
			if (!safeFragment && !safeFont && !safeImage) unsafe = true;
			return "";
		});
		return unsafe || /url\\s*\\(/i.test(remainder);
	}

	function validateSvg(svg, width, height) {
		if (typeof svg !== "string" || svg.length === 0 || svg.length > MAX_SVG_CHARS) {
			throw new Error("invalid capture SVG");
		}
		const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
		if (parsed.querySelector("parsererror")) throw new Error("invalid capture SVG");
		const root = parsed.documentElement;
		if (
			root.localName.toLowerCase() !== "svg" ||
			root.getAttribute("width") !== String(width) ||
			root.getAttribute("height") !== String(height)
		) {
			throw new Error("invalid capture SVG");
		}
		const nodeWalker = parsed.createTreeWalker(parsed, NodeFilter.SHOW_ALL);
		let nodeCount = 0;
		while (nodeWalker.nextNode()) {
			nodeCount += 1;
			if (nodeCount > MAX_SVG_NODES) throw new Error("capture document too large");
		}
		const elements = parsed.querySelectorAll("*");
		for (const element of elements) {
			const tag = element.localName.toLowerCase();
			if (FORBIDDEN_ELEMENTS.has(tag)) throw new Error("unsafe capture SVG");
			if (tag === "style" && unsafeCss(element.textContent || "")) {
				throw new Error("unsafe capture SVG");
			}
			for (const attribute of element.attributes) {
				const name = attribute.name.toLowerCase();
				const value = attribute.value.trim();
				if (name.startsWith("on") || unsafeCss(value)) throw new Error("unsafe capture SVG");
				if (!URL_ATTRIBUTES.has(name) || value === "" || value.startsWith("#")) continue;
				// An svg reached through src is a passive image context: scripting and
				// external references are off by specification, so it joins the rasters.
				if (name === "src" && SAFE_IMAGE_SRC_PREFIX.test(value)) continue;
				throw new Error("unsafe capture SVG");
			}
		}
		return svg;
	}

	async function validateJob(value, requestId) {
		if (
			!record(value) ||
			!exactKeys(value, ["dpr", "height", "id", "spool", "svg", "targetWidth", "width"]) ||
			value.spool !== RASTER ||
			value.id !== requestId
		) {
			throw new Error("invalid capture request");
		}
		const { width, height, dpr, targetWidth } = value;
		if (
			typeof width !== "number" ||
			!Number.isFinite(width) ||
			!Number.isSafeInteger(width) ||
			width <= 0 ||
			width > MAX_SOURCE_EDGE ||
			typeof height !== "number" ||
			!Number.isFinite(height) ||
			!Number.isSafeInteger(height) ||
			height <= 0 ||
			height > MAX_SOURCE_EDGE ||
			typeof dpr !== "number" ||
			!Number.isFinite(dpr) ||
			dpr <= 0 ||
			dpr > 2 ||
			typeof targetWidth !== "number" ||
			!Number.isFinite(targetWidth) ||
			!Number.isInteger(targetWidth) ||
			(targetWidth !== 0 && targetWidth !== ${LIVE_MIN_CSS_PX})
		) {
			throw new Error("invalid capture dimensions");
		}
		if (
			!(value.svg instanceof Blob) ||
			value.svg.type !== "image/svg+xml" ||
			value.svg.size === 0 ||
			value.svg.size > MAX_SOURCE_BYTES
		) {
			throw new Error("invalid capture SVG");
		}
		const scale = targetWidth > 0 ? (targetWidth * ${COVER_DEVICE_SCALE}) / width : dpr;
		const outputWidth = Math.max(1, Math.round(width * scale));
		const outputHeight = Math.max(1, Math.round(height * scale));
		if (
			!Number.isSafeInteger(outputWidth) ||
			!Number.isSafeInteger(outputHeight) ||
			outputWidth * outputHeight > MAX_CAPTURE_OUTPUT_PIXELS
		) {
			throw new Error("capture output too large");
		}
		return {
			svg: validateSvg(await value.svg.text(), width, height),
			targetWidth,
			outputWidth,
			outputHeight,
		};
	}

	function blobDataUrl(blob) {
		if (blob.size === 0 || blob.size > MAX_OUTPUT_BYTES) {
			return Promise.reject(new Error("capture output too large"));
		}
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = () => reject(reader.error || new Error("blob read failed"));
			reader.readAsDataURL(blob);
		});
	}

	function canvasBlob(canvas, type, quality) {
		return new Promise((resolve, reject) => {
			canvas.toBlob((blob) => {
				if (blob) resolve(blob);
				else reject(new Error("canvas blob encoding failed"));
			}, type, quality);
		});
	}

	// One image off one parsed snapshot; the daemon stores the reported raster as-is.
	async function raster(value, requestId) {
		const canvas = document.querySelector("canvas");
		if (!canvas) throw new Error("capture canvas unavailable");
		const image = new Image();
		try {
			const job = await validateJob(value, requestId);
			const context = canvas.getContext("2d");
			if (!context) throw new Error("capture canvas unavailable");
			image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(job.svg);
			await image.decode();
			canvas.width = job.outputWidth;
			canvas.height = job.outputHeight;
			context.fillStyle = "#fff";
			context.fillRect(0, 0, job.outputWidth, job.outputHeight);
			context.drawImage(image, 0, 0, job.outputWidth, job.outputHeight);
			const blob = job.targetWidth > 0
				? await canvasBlob(canvas, "image/jpeg", ${COVER_QUALITY})
				: await canvasBlob(canvas, "image/png");
			return { url: await blobDataUrl(blob), width: job.outputWidth, height: job.outputHeight };
		} finally {
			image.src = "";
			canvas.width = 0;
			canvas.height = 0;
		}
	}

	let bootstrapped = false;
	const onBootstrap = (event) => {
		if (bootstrapped || event.source !== parent || event.origin !== expectedParentOrigin) return;
		const value = event.data;
		if (
			!record(value) ||
			!exactKeys(value, ["id", "spool"]) ||
			value.spool !== BOOTSTRAP ||
			!safeRequestId(value.id) ||
			event.ports.length !== 1
		) {
			return;
		}
		bootstrapped = true;
		removeEventListener("message", onBootstrap);
		const requestId = value.id;
		const port = event.ports[0];
		let requested = false;
		const requestTimeout = setTimeout(() => {
			port.onmessage = null;
			port.onmessageerror = null;
			port.close();
		}, 2400);
		port.onmessage = (message) => {
			if (requested) return;
			requested = true;
			clearTimeout(requestTimeout);
			port.onmessage = null;
			port.onmessageerror = null;
			void (async () => {
				let reply;
				try {
					const image = await raster(message.data, requestId);
					reply = { spool: RESULT, id: requestId, image };
				} catch (error) {
					const text = error instanceof Error ? error.message : String(error);
					reply = { spool: RESULT, id: requestId, error: text.slice(0, 240) };
				}
				try {
					port.postMessage(reply);
				} finally {
					port.close();
				}
			})();
		};
		port.onmessageerror = () => {
			if (requested) return;
			requested = true;
			clearTimeout(requestTimeout);
			port.onmessage = null;
			port.onmessageerror = null;
			try {
				port.postMessage({ spool: RESULT, id: requestId, error: "invalid capture request" });
			} finally {
				port.close();
			}
		};
		port.start();
	};
	addEventListener("message", onBootstrap);
})();`;

const escapedCaptureWorkerJs = escapeInlineScript(captureWorkerJs);
const CAPTURE_WORKER_BASE_CSP = [
	"default-src 'none'",
	`script-src 'sha256-${createHash("sha256").update(escapedCaptureWorkerJs).digest("base64")}'`,
	"img-src data: blob:",
	"font-src data:",
	"connect-src 'none'",
	"worker-src 'none'",
	"object-src 'none'",
	"base-uri 'none'",
	"form-action 'none'",
	"frame-src 'none'",
	"style-src 'none'",
].join("; ");

export function captureWorkerCsp(controlOrigin: string): string {
	const origin = new URL(controlOrigin).origin;
	return `${CAPTURE_WORKER_BASE_CSP}; frame-ancestors ${origin}`;
}

export function captureWorkerDocument(controlOrigin: string): string {
	const origin = new URL(controlOrigin).origin;
	return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="spool-control-origin" content="${escapeHtml(origin)}"><title>spool capture</title></head>
<body><canvas></canvas><script>${escapedCaptureWorkerJs}</script></body></html>`;
}

export function assembleFrameDocument({
	project,
	frame,
	projectCapability,
	controlOrigin,
	css,
	fonts,
	bundledCss,
	importMap,
	bootJs,
}: FrameDocumentParts): string {
	const fontsBlock = fonts === undefined ? "" : `<style>${escapeInlineStyle(fonts)}</style>\n`;
	const bundledBlock = bundledCss === undefined ? "" : `<style>${escapeInlineStyle(bundledCss)}</style>\n`;
	// config and shim ride classic scripts so both exist before any module evaluates.
	// the height chain is baseline (#10): h-full reaches the frame edge in this
	// document AND inside the player's screen — one dialect for both contexts
	return htmlShell(
		frame,
		`<script>window.__SPOOL__ = ${escapeJsonScript({ project, frame, projectCapability, controlOrigin })}</script>
<script>${escapeInlineScript(canvasShimJs)}</script>
<style>html, body, #root { height: 100%; }</style>
<style>${escapeInlineStyle(css)}</style>
${fontsBlock}${bundledBlock}<script type="importmap">${escapeJsonScript(importMap)}</script>
`,
		`<div id="root"></div>
<script type="module">${escapeInlineScript(bootJs)}</script>
`,
	);
}

/**
 * The canvas shim (#8/#22), a classic script installed before any module so it
 * holds native references before frame code can replace them. HTML frames keep
 * running when Select owns the pointer; a terminal's freeze is a SIGSTOP in the
 * terminal runtime, and an HTML frame's is the rAF gate below. Speaks the host
 * protocol:
 * {spool:"freeze", on} holds this document's animations while the camera moves
 * (#171) or while nothing has attended the frame for a long minute (#172), and
 * re-delivers every held rAF callback on thaw;
 * {spool:"arrive", settleMs} answers {spool:"arrived"} once this document has
 * finished arriving — the same settle a capture waits out, reported rather than
 * photographed, so a promoted frame's cover fades onto a settled frame (#177);
 * {spool:"capture", id, targetWidth, settleMs}
 * answers with a sanitized foreignObject source for the trusted capture host
 * to rasterize off this frame's main thread. The frame waits out its own fonts
 * and entry animations first, and carries the faces it loaded in as data URIs,
 * because the isolated rasterization loads no external resources;
 * {spool:"pick", x, y} answers with the element ancestry at that frame-local
 * point — top-level element down to the deepest, each with its selector,
 * geometry, and nearest data-spool-source stamp (#23) — the canvas walks it
 * Figma-style (double-click descends, Esc ascends) without ever handing the
 * frame the pointer; {spool:"kin", selector, step} answers the same shape for
 * that element's first child or either sibling, which is the keyboard's half
 * of the same ladder (#254); {spool:"edit", selector, x, y} makes that element's
 * own words editable in place and answers {spool:"edit-open"}, then
 * {spool:"edited"} once Enter, Esc or a click away has ended it, and
 * {spool:"edit-end", commit} ends one from the canvas side (#255);
 * {spool:"sites"} answers with the frame-local boxes of
 * navigation-site elements (#34) so arrows grow out of what causes them.
 * Entered frames also hand canvas-zoom gestures back across
 * the iframe boundary; ordinary wheel input stays inside the frame so its own
 * scroll surfaces remain real.
 */
const canvasShimJs = `(() => {
	// Both taken before any module evaluates, because frame code may replace
	// either: the runtime's mock layer answers 404 to every route a scenario
	// never declared, and an animation library may own rAF outright. The shim's
	// own reads and its own frames are spool's, not the frame's.
	const nativeFetch = window.fetch.bind(window);
	const nativeRaf = window.requestAnimationFrame.bind(window);
	const nativeCancelRaf = window.cancelAnimationFrame.bind(window);

	/**
	 * A self-capture reads a canvas after frame code's own task has finished
	 * (#174): whatever WebGL drew is already gone by then, because the spec has
	 * the browser clear the drawing buffer once it is done compositing, unless
	 * the context was created with preserveDrawingBuffer. A 2D context has no
	 * such step, so only webgl/webgl2 need the override — and it overrides a
	 * frame author's own \`false\` too, since an accurate cover is the point, not
	 * a setting to negotiate with.
	 */
	const nativeGetContext = HTMLCanvasElement.prototype.getContext;
	HTMLCanvasElement.prototype.getContext = function getContext(type, attributes) {
		if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") {
			attributes = { ...attributes, preserveDrawingBuffer: true };
		}
		return Reflect.apply(nativeGetContext, this, [type, attributes]);
	};

	/**
	 * The freeze (#171, #172). A live frame holds its own animation rather than
	 * paying for frames nobody is reading — while the camera moves, where a 1.5s
	 * pan over eight animated frames spent 265 ms of it inside their rAF loops,
	 * and while nothing has attended the frame for a long minute, where the same
	 * eight cost 45% of a core for as long as the tab stayed open.
	 *
	 * Gating rAF is the load-bearing half. getAnimations() covers CSS and Web
	 * Animations and has never heard of a rAF loop, which is what a canvas
	 * animation and every spring actually are. Held callbacks are re-delivered on
	 * thaw and never cancelled — a loop that loses its callback is a frame that
	 * never animates again.
	 *
	 * The clock holds with them. Every timestamp this rAF hands out is the real
	 * one less the time spent frozen, so a loop that integrates \`time - last\`
	 * resumes with an ordinary frame's delta instead of a minute's worth, and the
	 * animation continues from where it stood rather than leaping to where it
	 * would have been. Paused animations already resume this way — the clock
	 * offset is only rAF being told the same thing. It never runs backwards:
	 * the offset accrues real elapsed time, so it can never exceed the timestamp
	 * it is subtracted from.
	 *
	 * Only rAF's own timestamp holds. \`performance.now()\` is the frame's, read
	 * straight, and a loop that stamps a start with one and measures against the
	 * other reads an elapsed short by the freeze. That is the same trade the
	 * platform makes for a paused animation's currentTime, and the alternative —
	 * a shimmed clock the whole document reads — would be spool lying to frame
	 * code about the time of day.
	 *
	 * The shim's own nativeRaf stays live under the freeze, and on real time, for
	 * the same reason it is bound before frame code runs: a capture's settle rides
	 * it. A frozen iframe keeps compositing its last painted pixels, so nothing
	 * visibly changes; the animation simply holds where it stood.
	 */
	let frozen = false;
	let frozenAt = 0;
	let frozenFor = 0;
	let nextRafHandle = 1;
	// handle -> { cb, native }; a native of 0 is a callback the freeze is holding
	const rafs = new Map();
	const paused = new Set();

	window.requestAnimationFrame = function requestAnimationFrame(callback) {
		if (typeof callback !== "function") {
			throw new TypeError("requestAnimationFrame: parameter 1 is not of type 'Function'");
		}
		const handle = nextRafHandle++;
		const entry = { cb: callback, native: 0 };
		rafs.set(handle, entry);
		if (!frozen) {
			entry.native = nativeRaf((time) => {
				rafs.delete(handle);
				callback(time - frozenFor);
			});
		}
		return handle;
	};

	window.cancelAnimationFrame = function cancelAnimationFrame(handle) {
		const entry = rafs.get(handle);
		if (entry === undefined) return;
		rafs.delete(handle);
		if (entry.native !== 0) nativeCancelRaf(entry.native);
	};

	// The freeze takes hold this tick rather than one frame later: whatever the
	// renderer had already scheduled joins the held callbacks instead of firing.
	function holdFrames() {
		for (const entry of rafs.values()) {
			if (entry.native === 0) continue;
			nativeCancelRaf(entry.native);
			entry.native = 0;
		}
	}

	function releaseFrames() {
		const due = [];
		for (const pair of rafs) if (pair[1].native === 0) due.push(pair[0]);
		if (due.length === 0) return;
		nativeRaf((time) => {
			// re-frozen inside the same tick: they stay held for the next thaw
			if (frozen) return;
			for (const handle of due) {
				const entry = rafs.get(handle);
				// cancelled while held, or already delivered by an earlier thaw
				if (entry === undefined) continue;
				rafs.delete(handle);
				try {
					entry.cb(time - frozenFor);
				} catch (error) {
					// one held callback's throw is not the next one's problem —
					// native rAF isolates them, so this does too
					setTimeout(() => { throw error; });
				}
			}
		});
	}

	function holdAnimations() {
		let running = [];
		try { running = document.getAnimations(); } catch {}
		for (const animation of running) {
			if (animation.playState !== "running") continue;
			try { animation.pause(); } catch { continue; }
			paused.add(animation);
		}
	}

	function releaseAnimations() {
		for (const animation of paused) {
			try { animation.play(); } catch {}
		}
		paused.clear();
	}

	function setFrozen(on) {
		if (on === frozen) return;
		frozen = on;
		if (on) {
			frozenAt = performance.now();
			holdFrames();
			holdAnimations();
		} else {
			// banked before anything is released: the thaw's own callbacks read it
			frozenFor += performance.now() - frozenAt;
			releaseAnimations();
			releaseFrames();
		}
	}

	function yieldCaptureTask() {
		if (typeof scheduler !== "undefined" && typeof scheduler.yield === "function") return scheduler.yield();
		return new Promise((resolve) => setTimeout(resolve, 0));
	}

	// The characters this document actually shows — a face whose unicode-range
	// covers none of them is bytes nobody would ever see. Large authored text
	// is scanned in bounded tasks so font subsetting cannot stall its renderer.
	async function documentCodepoints(root) {
		const seen = new Set();
		const text = root.textContent || "";
		let index = 0;
		while (index < text.length) {
			const end = Math.min(text.length, index + 64 * 1024);
			while (index < end) {
				const code = text.codePointAt(index);
				seen.add(code);
				index += code > 0xffff ? 2 : 1;
			}
			if (index < text.length) await yieldCaptureTask();
		}
		return seen;
	}

	// "U+0-10FFFF", "U+0102-0103", "U+30??" — any spelling, one question:
	// does this face carry a character on the page?
	function rangeWanted(spec, codes) {
		if (!spec) return true;
		for (const part of spec.split(",")) {
			const token = part.trim().replace(/^u\\+/i, "");
			if (token === "") continue;
			let lo;
			let hi;
			if (token.indexOf("?") >= 0) {
				lo = parseInt(token.replace(/\\?/g, "0"), 16);
				hi = parseInt(token.replace(/\\?/g, "F"), 16);
			} else {
				const ends = token.split("-");
				lo = parseInt(ends[0], 16);
				hi = ends.length > 1 ? parseInt(ends[1], 16) : lo;
			}
			if (!isFinite(lo) || !isFinite(hi)) continue;
			for (const code of codes) if (code >= lo && code <= hi) return true;
		}
		return false;
	}

	function bareFamily(name) {
		return String(name || "").trim().replace(/^["']|["']$/g, "").toLowerCase();
	}

	const fontDataUrls = new Map();
	async function asDataUrl(url) {
		let held = fontDataUrls.get(url);
		if (held === undefined) {
			held = nativeFetch(url)
				.then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
				.then((blob) => new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(reader.result);
					reader.onerror = () => reject(reader.error || new Error("font read failed"));
					reader.readAsDataURL(blob);
				}));
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
	async function inlineFontFaces(root) {
		const loaded = new Set();
		try {
			for (const face of document.fonts) if (face.status === "loaded") loaded.add(bareFamily(face.family));
		} catch {}
		if (loaded.size === 0) return "";
		const candidates = [];
		for (const sheet of Array.from(document.styleSheets)) {
			let rules;
			// a stylesheet this document cannot read has nothing to give
			try { rules = sheet.cssRules; } catch { continue; }
			for (const rule of Array.from(rules || [])) {
				if (rule.constructor.name !== "CSSFontFaceRule" && rule.type !== 5) continue;
				const style = rule.style;
				if (!loaded.has(bareFamily(style.fontFamily))) continue;
				const range = style.unicodeRange || "";
				const url = (/url\\(\\s*["']?([^"')]+)["']?\\s*\\)/.exec(style.src || "") || [])[1];
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
			css += "@font-face{font-family:" + face.family
				+ ";font-style:" + face.style
				+ ";font-weight:" + face.weight
				+ (face.stretch ? ";font-stretch:" + face.stretch : "")
				+ (face.variations ? ";font-variation-settings:" + face.variations : "")
				+ ";font-display:block;src:url(" + data + ")"
				+ (face.range ? ";unicode-range:" + face.range : "")
				+ "}";
		});
		return css;
	}

	/**
	 * A still is a picture of a frame that has finished arriving. Frames animate
	 * their content in, so capturing the instant a boot reports loaded records
	 * whatever had not faded in yet — and that missing content is what the
	 * canvas would then show in the frame's place. Waiting costs one settle and
	 * buys a still that matches. A looping animation never finishes, so the
	 * wait is bounded and infinite iterations are not waited on at all.
	 */
	async function settle(budgetMs) {
		if (!(budgetMs > 0)) return;
		const deadline = performance.now() + budgetMs;
		try { await document.fonts.ready; } catch {}
		while (performance.now() < deadline) {
			let arriving = 0;
			try {
				for (const animation of document.getAnimations()) {
					if (animation.playState !== "running") continue;
					let iterations = 1;
					try { iterations = animation.effect.getComputedTiming().iterations; } catch {}
					// a loop never finishes; waiting on one would only time out
					if (iterations !== Infinity) arriving++;
				}
			} catch {}
			if (arriving === 0) break;
			await new Promise((resolve) => setTimeout(resolve, 60));
		}
		// Most of what a frame animates, no timing API reports: a spring is
		// rAF-driven inline style writes, and getAnimations() has never heard of
		// it. A quiet DOM is the signal that works whatever the library — wait
		// for nothing to change for a beat, and give up at the budget so a frame
		// that animates forever still gets photographed.
		await new Promise((resolve) => {
			let quiet = 0;
			const observer = new MutationObserver(() => {
				clearTimeout(quiet);
				quiet = setTimeout(done, 120);
			});
			const cap = setTimeout(done, Math.max(0, deadline - performance.now()));
			function done() {
				clearTimeout(quiet);
				clearTimeout(cap);
				try { observer.disconnect(); } catch {}
				resolve();
			}
			try {
				observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true, characterData: true });
			} catch { done(); return; }
			quiet = setTimeout(done, 120);
		});
		// Two native frames, so a rAF-driven entry animation's last commit lands.
		// Chrome holds rAF entirely in an offscreen iframe, and a frame borrowed
		// for a picture may be one — the race with the timer is what keeps a
		// capture inside its deadline either way.
		await new Promise((resolve) => {
			const timer = setTimeout(resolve, Math.max(0, Math.min(100, deadline - performance.now())));
			nativeRaf(() => nativeRaf(() => { clearTimeout(timer); resolve(); }));
		});
	}

	const SAFE_FONT_DATA_URL = /^data:font\\/(?:otf|ttf|woff2?);base64,[a-z0-9+/]+={0,2}$/i;
	const SAFE_IMAGE_DATA_URL = /^data:image\\/(?:${CAPTURE_IMAGE_TYPES});base64,[a-z0-9+/]+={0,2}$/i;
	const SAFE_IMAGE_SRC_PREFIX = /^data:image\\/(?:${CAPTURE_IMAGE_TYPES});base64,/i;

	function sanitizeCaptureClone(clone) {
		for (const element of clone.querySelectorAll(
			"audio, base, embed, frame, iframe, link, meta, object, script, source, track, video"
		)) {
			element.remove();
		}
		for (const style of clone.querySelectorAll("style")) {
			const css = style.textContent || "";
			if (!unsafeCaptureCss(css)) continue;
			const rewritten = rewriteCaptureStyle(css);
			if (rewritten === null) style.remove();
			else style.textContent = rewritten;
		}
		const urlAttributes = new Set([
			"action", "background", "cite", "data", "formaction", "href",
			"poster", "src", "srcset", "xlink:href"
		]);
		for (const element of clone.querySelectorAll("*")) {
			for (const attribute of Array.from(element.attributes)) {
				const name = attribute.name.toLowerCase();
				if (name.startsWith("on") || unsafeCaptureCss(attribute.value)) {
					element.removeAttribute(attribute.name);
					continue;
				}
				if (!urlAttributes.has(name)) continue;
				const value = attribute.value.trim();
				if (value === "" || value.startsWith("#") || (name === "src" && SAFE_IMAGE_SRC_PREFIX.test(value))) {
					continue;
				}
				element.removeAttribute(attribute.name);
			}
		}
	}

	function rewriteCaptureStyle(value) {
		// replaceSync silently drops @import rules. Only unsafe URL-bearing CSS
		// takes the rewrite path; import-only styles keep the old removal path.
		if (!hasUnsafeCaptureUrl(normalizeCaptureCss(value))) return null;
		const sheet = new CSSStyleSheet();
		try {
			sheet.replaceSync(value);
		} catch {
			return null;
		}
		stripUnsafeCaptureRules(sheet);
		const rewritten = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\\n");
		return unsafeCaptureCss(rewritten) ? null : rewritten;
	}

	function stripUnsafeCaptureRules(parent) {
		for (let index = parent.cssRules.length - 1; index >= 0; index--) {
			const rule = parent.cssRules[index];
			if (rule.cssRules) stripUnsafeCaptureRules(rule);
			stripUnsafeCaptureDeclarations(rule);
			if (unsafeCaptureCss(rule.cssText)) parent.deleteRule(index);
		}
	}

	function stripUnsafeCaptureDeclarations(rule) {
		if (!rule.style) return;
		for (const property of Array.from(rule.style)) {
			const declaration = property + ":" + rule.style.getPropertyValue(property);
			if (unsafeCaptureCss(declaration)) rule.style.removeProperty(property);
		}
	}

	function normalizeCaptureCss(value) {
		return value
			.replace(/\\\\([0-9a-f]{1,6})\\s?/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
			.replace(/\\\\([^\\n\\r\\f])/g, "$1");
	}

	function hasUnsafeCaptureUrl(normalized) {
		let unsafe = false;
		const remainder = normalized.replace(/url\\s*\\(\\s*([^)]*)\\)/gi, (_match, raw) => {
			let target = raw.trim();
			if (
				(target.startsWith('"') && target.endsWith('"')) ||
				(target.startsWith("'") && target.endsWith("'"))
			) {
				target = target.slice(1, -1).trim();
			}
			const safeFragment = /^#[^\\s"'()]+$/.test(target);
			const safeFont = target.length <= 16 * 1024 * 1024 && SAFE_FONT_DATA_URL.test(target);
			const safeImage = target.length <= 16 * 1024 * 1024 && SAFE_IMAGE_DATA_URL.test(target);
			if (!safeFragment && !safeFont && !safeImage) unsafe = true;
			return "";
		});
		return unsafe || /url\\s*\\(/i.test(remainder);
	}

	function unsafeCaptureCss(value) {
		const normalized = normalizeCaptureCss(value);
		return /@import/i.test(normalized) || hasUnsafeCaptureUrl(normalized);
	}

	// The live threshold asks for a still; zero asks for a full-resolution export.
	async function captureSource(targetWidth, settleMs) {
		await settle(settleMs);
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
		const blobDataUrl = (blob) => new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = () => reject(reader.error || new Error("blob read failed"));
			reader.readAsDataURL(blob);
		});
		const canvasDataUrl = (canvas) => new Promise((resolve, reject) => {
			canvas.toBlob((blob) => {
				if (blob) blobDataUrl(blob).then(resolve, reject);
				else reject(new Error("canvas blob encoding failed"));
			}, "image/png");
		});
		const canvasSnapshots = Array.from(srcCanvas, (canvas) => ({
			style: canvas.getAttribute("style") || "",
			width: canvas.clientWidth,
			height: canvas.clientHeight,
		}));
		const canvasUrlsPromise = Promise.all(Array.from(srcCanvas, (canvas) => canvasDataUrl(canvas)));
		const clone = document.documentElement.cloneNode(true);
		clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
		const srcInputs = document.querySelectorAll("input, textarea");
		const dstInputs = clone.querySelectorAll("input, textarea");
		srcInputs.forEach((el, i) => { const d = dstInputs[i]; if (d) d.setAttribute("value", el.value); });
		const fontCssPromise = inlineFontFaces(clone);
		const [canvasUrls, fontCss] = await Promise.all([canvasUrlsPromise, fontCssPromise]);
		// Cached font promises and canvas encodes may resolve in this same task.
		// Give the renderer a paint before sanitizing and serializing the clone.
		await yieldCaptureTask();
		const dstCanvas = clone.querySelectorAll("canvas");
		for (let i = 0; i < srcCanvas.length; i++) {
			const d = dstCanvas[i];
			const snapshot = canvasSnapshots[i];
			if (!d || !d.parentNode) continue;
			const img = document.createElement("img");
			img.setAttribute("src", canvasUrls[i]);
			img.setAttribute(
				"style",
				snapshot.style + ";width:" + snapshot.width + "px;height:" + snapshot.height + "px"
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
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">'
			+ '<foreignObject width="100%" height="100%">' + xml + "</foreignObject></svg>";
		// A cover is a boot placeholder, not an artifact. The worker rasterizes it
		// at the shared readable width; an export remains lossless and full-size.
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const source = new Blob([svg], { type: "image/svg+xml" });
		if (source.size > 16 * 1024 * 1024) throw new Error("capture source too large");
		return { svg: source, width: W, height: H, dpr, targetWidth };
	}

	// selector below the boot root: tags with :nth-of-type where siblings repeat
	function cssPath(el) {
		const parts = [];
		let node = el;
		while (node && node.nodeType === 1 && node !== document.body && node.id !== "root" && parts.length < 8) {
			if (node.id) { parts.unshift("#" + node.id); return parts.join(" > "); }
			let seg = node.tagName.toLowerCase();
			const parent = node.parentElement;
			if (parent) {
				const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
				if (same.length > 1) seg += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
			}
			parts.unshift(seg);
			node = parent;
		}
		return parts.join(" > ");
	}

	function hitOf(el) {
		let stamped = el;
		while (stamped && stamped.nodeType === 1 && !stamped.hasAttribute("data-spool-source")) {
			stamped = stamped.parentElement;
		}
		const source = stamped && stamped.nodeType === 1 ? stamped.getAttribute("data-spool-source") : null;
		const rect = el.getBoundingClientRect();
		let radius = 0;
		try { radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0; } catch {}
		return {
			selector: cssPath(el),
			tag: el.tagName.toLowerCase(),
			outerHtml: el.outerHTML.slice(0, 240),
			rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
			radius,
			source,
			generated: stamped !== el,
		};
	}

	// the ancestry of one element, top-level element first, deepest last
	function chainOf(el) {
		const line = [];
		let node = el;
		while (node && node.nodeType === 1 && node !== document.documentElement && node !== document.body && node.id !== "root") {
			line.unshift(node);
			node = node.parentElement;
		}
		return line.map(hitOf);
	}

	// the ancestry at the point
	function pickChain(x, y) {
		const el = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
		if (!el || el === document.documentElement || el === document.body || el.id === "root") return [];
		return chainOf(el);
	}

	// A selector back to its element. cssPath stops at the boot root and takes a
	// shortcut through any id it passes, so the match is confirmed by rebuilding
	// the path rather than trusted: one query can answer for a different element.
	function elementFor(selector) {
		if (!selector) return null;
		let found = null;
		try {
			const all = document.querySelectorAll(selector);
			for (let i = 0; i < all.length; i++) {
				if (cssPath(all[i]) === selector) { found = all[i]; break; }
			}
		} catch {}
		return found;
	}

	// the ancestry of one element's kin (#254): the keyboard's rung, named by
	// kinship because there is no pointer to name it by position
	function kinChain(selector, step) {
		const from = selector ? elementFor(selector) : (document.getElementById("root") || document.body);
		if (!from) return [];
		const kin = step === "self"
			? from
			: step === "child"
				? from.firstElementChild
				: step === "next"
					? from.nextElementSibling
					: step === "previous"
						? from.previousElementSibling
						: null;
		if (!kin || kin === document.documentElement || kin === document.body || kin.id === "root") return [];
		return chainOf(kin);
	}

	/**
	 * The in-place text edit (#255): the element itself becomes the field.
	 *
	 * A hand edits the words where they are drawn rather than in a box
	 * somewhere else, so the element is made editable, focused, and given the
	 * caret at the point that was clicked. Enter and a click away commit; Esc
	 * puts back what was there.
	 *
	 * While an edit is open the shim swallows the keys and the presses before
	 * frame code sees them. That is not the chrome bending the frame: the
	 * keystrokes are the edit's, and a prototype that binds a bare letter to a
	 * drawer would otherwise open one on every word typed into it. The default
	 * actions are untouched, which is what puts the characters in and moves the
	 * caret. Nothing else about the document changes, and the attribute comes
	 * off the moment the edit ends.
	 */
	var editing = null;

	function beginEdit(selector, x, y, id) {
		endEdit(false);
		const frame = (window.__SPOOL__ || {}).frame;
		const el = elementFor(selector);
		if (!el) {
			parent.postMessage({ spool: "edit-open", frame, id, ok: false, text: "" }, "*");
			return;
		}
		editing = { el, id, text: el.textContent || "" };
		el.setAttribute("contenteditable", "plaintext-only");
		el.setAttribute("spellcheck", "false");
		try { el.focus({ preventScroll: true }); } catch { try { el.focus(); } catch {} }
		try { caretAt(el, x, y); } catch {}
		parent.postMessage({ spool: "edit-open", frame, id, ok: true, text: editing.text }, "*");
	}

	function endEdit(commit) {
		if (!editing) return;
		const held = editing;
		editing = null;
		const el = held.el;
		const text = el.textContent || "";
		el.removeAttribute("contenteditable");
		el.removeAttribute("spellcheck");
		try { el.blur(); } catch {}
		// Esc restores; a commit leaves the typed words standing, because the
		// reload that carries them into the file is a moment away and flashing
		// the old ones back is exactly the blink the write lane avoids
		if (!commit) el.textContent = held.text;
		parent.postMessage({
			spool: "edited",
			frame: (window.__SPOOL__ || {}).frame,
			id: held.id,
			commit: commit === true,
			text,
		}, "*");
	}

	// the caret where the click was, and the whole of the words when the
	// browser cannot resolve a point inside them
	function caretAt(el, x, y) {
		const selection = getSelection();
		if (!selection) return;
		let range = null;
		if (typeof x === "number" && typeof y === "number") {
			if (document.caretRangeFromPoint) {
				range = document.caretRangeFromPoint(x, y);
			} else if (document.caretPositionFromPoint) {
				const at = document.caretPositionFromPoint(x, y);
				if (at) {
					range = document.createRange();
					range.setStart(at.offsetNode, at.offset);
					range.collapse(true);
				}
			}
		}
		if (!range || !el.contains(range.startContainer)) {
			range = document.createRange();
			range.selectNodeContents(el);
		}
		selection.removeAllRanges();
		selection.addRange(range);
	}

	// A press inside the words places the caret and goes no further; a press
	// anywhere else is the click-away that commits, and the frame never sees it.
	var swallowWhileEditing = (event) => {
		if (!editing) return;
		if (editing.el.contains(event.target)) {
			event.stopPropagation();
			return;
		}
		event.stopPropagation();
		event.preventDefault();
		if (event.type === "pointerdown") endEdit(true);
	};
	for (const kind of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick"]) {
		addEventListener(kind, swallowWhileEditing, true);
	}

	// focus leaving the words, or the whole frame, is a click-away by another
	// name. The element's own focus() blurs whatever held it first, which is
	// why only these two targets count.
	addEventListener("blur", (event) => {
		if (editing && (event.target === editing.el || event.target === window)) endEdit(true);
	}, true);

	// the release half of every key the edit took. stopPropagation rather than
	// stopImmediatePropagation, so the modifier relay below — a listener on this
	// same window — still tells the canvas when the accel key came back up.
	addEventListener("keyup", (event) => {
		if (editing) event.stopPropagation();
	}, true);

	// where each anchor's element sits, over the one set of data-spool-source
	// stamps. Two forms of anchor, one message and one answer shape:
	//
	//   a point (#34) — one stamp exactly, keyed path:line:col. Navigation
	//   sites, with the rendered data-go attribute as fallback, because a
	//   component-wrapped element stamps where it is authored rather than at
	//   the site.
	//
	//   a range (#214) — every stamp on this file whose line falls inside it,
	//   unioned, keyed path:from-to. Where one write landed: the daemon reads
	//   the file and answers lines, and only the document can turn lines into
	//   a box. The union rather than the outermost, because the lines an edit
	//   touched need not render one element and a plate has to cover them all.
	function siteBoxes(sites) {
		const byStamp = new Map();
		const stamped = Array.from(document.querySelectorAll("[data-spool-source]"));
		for (const el of stamped) {
			const stamp = el.getAttribute("data-spool-source");
			if (stamp && !byStamp.has(stamp)) byStamp.set(stamp, el);
		}
		const carriers = Array.from(document.querySelectorAll("[data-go]"));
		const claimed = new Set();
		const boxes = {};
		for (const site of Array.isArray(sites) ? sites : []) {
			if (!site || typeof site.path !== "string") continue;
			if (typeof site.through === "number") {
				boxes[site.path + ":" + site.line + "-" + site.through] = rangeBox(stamped, site);
				continue;
			}
			const key = site.path + ":" + site.line + ":" + site.col;
			let el = byStamp.get(key) || null;
			if (!el && typeof site.target === "string") {
				el = carriers.find((c) => c.getAttribute("data-go") === site.target && !claimed.has(c)) || null;
			}
			if (el) claimed.add(el);
			if (el) {
				const rect = el.getBoundingClientRect();
				boxes[key] = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
			} else {
				boxes[key] = null;
			}
		}
		return boxes;
	}

	// the union of every stamped element this file authored inside these lines,
	// clipped to the frame. An element with no area is skipped: a stamp
	// resolving to something laid out nowhere would drag the union to the
	// document's own origin.
	//
	// The clip is what keeps a mark about the frame (#222). A union is bounded
	// by the elements it covers and by nothing else, so a whole-file write takes
	// every stamp in the document and an edit below the fold measures past the
	// bottom edge — either one draws a lane taller than the frame it is beside.
	// These rects are viewport-relative and a frame document's viewport is the
	// frame, so the frame's own rectangle is the clip. A range that renders
	// nothing inside it answers no box, the same as one that renders nothing at
	// all, and a rewrite of the whole file legitimately answers the whole frame.
	function rangeBox(stamped, site) {
		let x0 = 0;
		let y0 = 0;
		let x1 = 0;
		let y1 = 0;
		let found = false;
		for (const el of stamped) {
			const stamp = el.getAttribute("data-spool-source") || "";
			const cut = stamp.lastIndexOf(":");
			const split = cut < 0 ? -1 : stamp.lastIndexOf(":", cut - 1);
			if (split < 0 || stamp.slice(0, split) !== site.path) continue;
			const line = parseInt(stamp.slice(split + 1, cut), 10);
			if (!(line >= site.line) || !(line <= site.through)) continue;
			const rect = el.getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) continue;
			if (!found) {
				x0 = rect.x;
				y0 = rect.y;
				x1 = rect.x + rect.width;
				y1 = rect.y + rect.height;
				found = true;
				continue;
			}
			x0 = Math.min(x0, rect.x);
			y0 = Math.min(y0, rect.y);
			x1 = Math.max(x1, rect.x + rect.width);
			y1 = Math.max(y1, rect.y + rect.height);
		}
		if (!found) return null;
		const left = Math.min(Math.max(x0, 0), innerWidth);
		const top = Math.min(Math.max(y0, 0), innerHeight);
		const right = Math.min(Math.max(x1, 0), innerWidth);
		const bottom = Math.min(Math.max(y1, 0), innerHeight);
		if (!(right > left) || !(bottom > top)) return null;
		return { x: left, y: top, w: right - left, h: bottom - top };
	}

	let captureInFlight = false;
	/**
	 * Arrival is reported once per document (#177). A frame arrives once; a
	 * second report would be about something the document did later, and the
	 * canvas is asking when it may stop standing a picture in front of this one.
	 */
	let arrivalReported = false;
	addEventListener("message", async (event) => {
		const m = event.data;
		if (!m || typeof m !== "object") return;
		if (m.spool === "arrive") {
			// The same settle a capture waits out, answered as a bare report (#177).
			// Loaded is mid-arrival: an entry animation is at its beginning where
			// the still photographed its end, and a canvas frame may not have drawn
			// a tick yet. Waiting out the settle is how the cover fades onto the
			// frame its picture is a picture of.
			const config = window.__SPOOL__ || {};
			const settleMs = m.settleMs;
			if (
				arrivalReported ||
				event.source !== parent ||
				event.origin !== config.controlOrigin ||
				typeof settleMs !== "number" ||
				!Number.isFinite(settleMs) ||
				!Number.isInteger(settleMs) ||
				settleMs < 0 ||
				settleMs > 900
			) {
				return;
			}
			arrivalReported = true;
			// A settle that threw still arrived: the canvas is holding a cover on
			// this answer, and its own deadline is the only other thing that frees it.
			try { await settle(settleMs); } catch {}
			parent.postMessage({ spool: "arrived", frame: config.frame }, "*");
			return;
		}
		if (m.spool === "pick") {
			const frame = (window.__SPOOL__ || {}).frame;
			let chain = [];
			try { chain = pickChain(m.x, m.y); } catch {}
			parent.postMessage({ spool: "picked", frame, id: m.id, chain }, "*");
			return;
		}
		if (m.spool === "kin") {
			const frame = (window.__SPOOL__ || {}).frame;
			let chain = [];
			try { chain = kinChain(m.selector, m.step); } catch {}
			parent.postMessage({ spool: "picked", frame, id: m.id, chain }, "*");
			return;
		}
		if (m.spool === "edit" || m.spool === "edit-end") {
			// the two verbs that change the document rather than read it, so they
			// are held to the same door the capture is: this frame's own canvas
			const config = window.__SPOOL__ || {};
			if (event.source !== parent || event.origin !== config.controlOrigin) return;
			if (m.spool === "edit-end") {
				endEdit(m.commit === true);
				return;
			}
			try {
				beginEdit(m.selector, m.x, m.y, m.id);
			} catch {
				parent.postMessage({ spool: "edit-open", frame: config.frame, id: m.id, ok: false, text: "" }, "*");
			}
			return;
		}
		if (m.spool === "sites") {
			const frame = (window.__SPOOL__ || {}).frame;
			let boxes = {};
			try { boxes = siteBoxes(m.sites); } catch {}
			parent.postMessage({ spool: "site-boxes", frame, id: m.id, boxes }, "*");
			return;
		}
		if (m.spool === "freeze") {
			setFrozen(m.on === true);
			return;
		}
		if (m.spool !== "capture") return;
		const config = window.__SPOOL__ || {};
		const frame = config.frame;
		const id = m.id;
		if (
			event.source !== parent ||
			event.origin !== config.controlOrigin ||
			typeof id !== "string" ||
			!/^[0-9a-f]{32}$/.test(id)
		) {
			return;
		}
		if (captureInFlight) {
			parent.postMessage(
				{ spool: "capture-source", frame, id, error: "capture already in progress" },
				config.controlOrigin
			);
			return;
		}
		captureInFlight = true;
		try {
			const targetWidth = m.targetWidth;
			const settleMs = m.settleMs;
			if (
				typeof targetWidth !== "number" ||
				!Number.isFinite(targetWidth) ||
				!Number.isInteger(targetWidth) ||
				(targetWidth !== 0 && targetWidth !== ${LIVE_MIN_CSS_PX}) ||
				typeof settleMs !== "number" ||
				!Number.isFinite(settleMs) ||
				!Number.isInteger(settleMs) ||
				settleMs < 0 ||
				settleMs > 900
			) {
				throw new Error("invalid capture dimensions");
			}
			const source = await captureSource(targetWidth, settleMs);
			parent.postMessage({ spool: "capture-source", frame, id, ...source }, config.controlOrigin);
		} catch (error) {
			parent.postMessage(
				{ spool: "capture-source", frame, id, error: String(error).slice(0, 240) },
				config.controlOrigin
			);
		} finally {
			captureInFlight = false;
		}
	});

	// Wheel and key events do not cross an iframe boundary. Once entered, the
	// frame owns both, so claim only browser/canvas zoom gestures here and hand
	// them to the host. Ordinary wheel input remains the frame's own scrolling.
	addEventListener("wheel", (event) => {
		if (window.parent === window || (!event.ctrlKey && !event.metaKey)) return;
		event.preventDefault();
		window.parent.postMessage({
			spool: "zoom",
			frame: (window.__SPOOL__ || {}).frame,
			kind: "wheel",
			x: event.clientX,
			y: event.clientY,
			deltaY: event.deltaY,
			deltaMode: event.deltaMode,
		}, "*");
	}, { passive: false });

	// Esc must still exit (#22); browser zoom shortcuts become the canvas's
	// shortcuts so a focused frame cannot zoom the whole page into a trap.
	addEventListener("keydown", (event) => {
		if (window.parent === window) return;
		const frame = (window.__SPOOL__ || {}).frame;
		// an open in-place edit owns the keyboard (#255): Enter commits, Esc
		// puts back, and every other key is the edit's rather than the
		// prototype's — the default action still types the character
		if (editing) {
			if (event.key === "Enter" || event.key === "Escape") {
				event.preventDefault();
				event.stopImmediatePropagation();
				endEdit(event.key === "Enter");
				return;
			}
			// A space is the element's own key before it is the text's: a button
			// takes it as a press and eats it, so words typed into one would come
			// out run together. The character is put in by hand instead, which is
			// the same thing the browser would have done with it.
			if (event.key === " " && !event.metaKey && !event.ctrlKey && !event.altKey) {
				event.preventDefault();
				event.stopImmediatePropagation();
				try { document.execCommand("insertText", false, " "); } catch {}
				return;
			}
			event.stopPropagation();
			return;
		}
		// which key is the accel modifier is the canvas's rule, not the frame's:
		// report the key that moved and let the canvas decide it counts
		if (event.key === "Meta" || event.key === "Control") {
			window.parent.postMessage({ spool: "modifier", frame, modifier: event.key, held: true }, "*");
			return;
		}
		if (event.key === "Escape") {
			window.parent.postMessage({ spool: "key", frame, key: "Escape" }, "*");
			return;
		}
		// the jump chords are the canvas's on every platform (#166): relay the
		// literal control chord and eat the browser's open-file dialog
		if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && (event.key === "o" || event.key === "i")) {
			event.preventDefault();
			window.parent.postMessage({ spool: "key", frame, key: "ctrl+" + event.key }, "*");
			return;
		}
		if (!event.metaKey && !event.ctrlKey) return;
		let kind;
		if (event.key === "+" || event.key === "=") kind = "in";
		else if (event.key === "-") kind = "out";
		else return;
			event.preventDefault();
			window.parent.postMessage({ spool: "zoom", frame, kind }, "*");
		}, true);

	// A pointer trap is the same failure as a zoom trap: entered, the frame owns
	// every press, so the canvas would have no way to pan out from under it. The
	// middle button is the one gesture no app binds, so it stays the canvas's.
	// Screen coordinates travel: the host only ever wants the delta.
	var panning = false;
	addEventListener("pointerdown", (event) => {
		if (window.parent === window || event.button !== 1) return;
		event.preventDefault();
		panning = true;
		window.parent.postMessage({
			spool: "pan",
			frame: (window.__SPOOL__ || {}).frame,
			phase: "start",
			x: event.screenX,
			y: event.screenY,
		}, "*");
	}, true);

	addEventListener("pointermove", (event) => {
		if (!panning) return;
		window.parent.postMessage({
			spool: "pan",
			frame: (window.__SPOOL__ || {}).frame,
			phase: "move",
			x: event.screenX,
			y: event.screenY,
		}, "*");
	}, true);

	var endPan = () => {
		if (!panning) return;
		panning = false;
		window.parent.postMessage({
			spool: "pan",
			frame: (window.__SPOOL__ || {}).frame,
			phase: "end",
			x: 0,
			y: 0,
		}, "*");
	};
	addEventListener("pointerup", endPan, true);
	addEventListener("pointercancel", endPan, true);

	addEventListener("keyup", (event) => {
		if (window.parent === window) return;
		if (event.key !== "Meta" && event.key !== "Control") return;
		window.parent.postMessage({
			spool: "modifier",
			frame: (window.__SPOOL__ || {}).frame,
			modifier: event.key,
				held: false,
			}, "*");
		}, true);

	// losing focus releases both candidates: the canvas owns the accel rule, so
	// naming only one would leave the other platform's modifier stuck down
	addEventListener("blur", () => {
		if (window.parent === window) return;
		const frame = (window.__SPOOL__ || {}).frame;
		for (const modifier of ["Meta", "Control"]) {
			window.parent.postMessage({ spool: "modifier", frame, modifier, held: false }, "*");
		}
	});
})();
`;

/**
 * The shim's identity, folded into every document hash (#23): the shim is
 * baked into the daemon process, invisible to the input files — without this
 * a restarted daemon 304s browsers into keeping documents whose shim speaks
 * yesterday's protocol.
 */
export const shimHash: string = createHash("sha256").update(canvasShimJs).digest("hex");

/**
 * The document served when a frame does not compile: the toolchain's message,
 * verbatim, plus the same postMessage protocol so a canvas can mark the frame
 * failed instead of waiting on a loaded report.
 */
export function errorDocument(frame: string, message: string, failure = "failed to compile"): string {
	const report = `if (parent !== window) parent.postMessage({ spool: "error", frame: ${JSON.stringify(frame)}, error: ${JSON.stringify(message)} }, "*");`;
	return failureDocument(frame, message, failure, report);
}

/**
 * A composed player that fails after the control preflight has no runtime
 * channel. Its document gets one separate, exact load-failure signal; a
 * successfully connected authored runtime can never use this protocol.
 */
export function playerLoadErrorDocument(message: string, failure = "failed to compile"): string {
	return playerFailureDocument(message, failure, "player-load-error");
}

/**
 * A rejected handoff is the one player failure the outer shell can repair, so it
 * gets its own message (#88): the shell mints a fresh token and reloads, and a
 * frame whose code simply will not compile never enters that retry.
 */
export function playerHandoffRejectedDocument(message: string): string {
	return playerFailureDocument(message, "failed to load", "player-handoff-rejected");
}

function playerFailureDocument(message: string, failure: string, spool: string): string {
	const report = `if (parent !== window) parent.postMessage({ spool: ${JSON.stringify(spool)}, error: ${JSON.stringify(message)} }, "*");`;
	return failureDocument("player", message, failure, report);
}

function failureDocument(frame: string, message: string, failure: string, report: string): string {
	return htmlShell(
		frame,
		`<style>
body { margin: 0; padding: 24px; background: #111110; color: #b5b3ad; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
h1 { margin: 0 0 16px; font-size: 13px; font-weight: 400; color: #f5391a; }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
</style>
`,
		`<h1>${escapeHtml(frame)} ${escapeHtml(failure)}</h1>
<pre>${escapeHtml(message)}</pre>
<script>${escapeInlineScript(report)}</script>
`,
	);
}

function htmlShell(frame: string, head: string, body: string): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<title>${escapeHtml(frame)} · spool</title>
${head}</head>
<body>
${body}</body>
</html>
`;
}

/** Merge the project's import map under spool's pins — the pinned React always wins. */
export function mergeImportMap(project: unknown, pins: Record<string, string>): object {
	if (project === undefined) return { imports: pins };
	if (typeof project !== "object" || project === null || Array.isArray(project)) {
		throw new Error("shared/importmap.json must be a JSON object");
	}
	const record = project as Record<string, unknown>;
	const imports = record.imports ?? {};
	if (typeof imports !== "object" || imports === null || Array.isArray(imports)) {
		throw new Error('shared/importmap.json: "imports" must be an object');
	}
	const merged: Record<string, unknown> = { imports: { ...imports, ...pins } };
	if (record.scopes !== undefined) merged.scopes = record.scopes;
	return merged;
}

export function escapeHtml(text: string): string {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/**
 * The HTML parser ends a script element at the first `</script` regardless of
 * JS context; inside string literals the escaped form reads back identically.
 */
export function escapeInlineScript(js: string): string {
	return js.replace(/<\/script/gi, "<\\/script");
}

/** Same parser rule for style elements; `\/` in a CSS string is a literal `/`. */
export function escapeInlineStyle(css: string): string {
	return css.replace(/<\/style/gi, "<\\/style");
}

/** JSON embedded in a script element: escaping every `<` closes all parser holes. */
export function escapeJsonScript(value: unknown): string {
	return JSON.stringify(value).replaceAll("<", "\\u003c");
}
