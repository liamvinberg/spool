import { createHash } from "node:crypto";
import { COVER_QUALITY, COVER_RUNGS } from "../cover";

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
	const MAX_OUTPUT_PIXELS = 32 * 1024 * 1024;
	const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
	const REQUEST_ID = /^[0-9a-f]{32}$/;
	const SAFE_FONT_DATA_URL = /^data:font\\/(?:otf|ttf|woff2?);base64,[a-z0-9+/]+={0,2}$/i;
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
			if (!safeFragment && !safeFont) unsafe = true;
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
				if (name === "src" && /^data:image\\/(?:gif|jpeg|png|webp);base64,/i.test(value)) continue;
				throw new Error("unsafe capture SVG");
			}
		}
		return svg;
	}

	async function validateJob(value, requestId) {
		if (
			!record(value) ||
			!exactKeys(value, ["dpr", "height", "id", "maxEdge", "spool", "svg", "width"]) ||
			value.spool !== RASTER ||
			value.id !== requestId
		) {
			throw new Error("invalid capture request");
		}
		const { width, height, dpr, maxEdge } = value;
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
			typeof maxEdge !== "number" ||
			!Number.isFinite(maxEdge) ||
			!Number.isInteger(maxEdge) ||
			maxEdge < 0 ||
			maxEdge > 16384
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
		// A cover's ladder belongs to the frame, not to the monitor that photographed
		// it: the top rung is the frame's long edge at 2×, under the cap. Scaling by
		// the capturing realm's own ratio instead would make a cover taken on a 1×
		// display soft at 100% zoom on a 2× one — and a sandboxed frame does not
		// always report the ratio its canvas has. An export is the other contract,
		// and says so: the frame at full device resolution.
		const scale = maxEdge > 0 ? Math.min(2, maxEdge / Math.max(width, height)) : dpr;
		const outputWidth = Math.max(1, Math.round(width * scale));
		const outputHeight = Math.max(1, Math.round(height * scale));
		if (
			!Number.isSafeInteger(outputWidth) ||
			!Number.isSafeInteger(outputHeight) ||
			outputWidth * outputHeight > MAX_OUTPUT_PIXELS
		) {
			throw new Error("capture output too large");
		}
		return {
			svg: validateSvg(await value.svg.text(), width, height),
			maxEdge,
			outputWidth,
			outputHeight,
			// a cover is a ladder; an export is the one sheet its caller asked for
			rungs: maxEdge > 0 ? ${COVER_RUNGS} : 1,
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

	// Every rung off one parsed snapshot: the source is validated once and decoded
	// once, and each rung below the top is the same picture drawn smaller. Each
	// answer carries the size it actually came out, because the daemon has no
	// image library and takes this realm's word for how wide a rung is.
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
			const rungs = [];
			for (let index = 0; index < job.rungs; index++) {
				const step = 2 ** index;
				const width = Math.max(1, Math.round(job.outputWidth / step));
				const height = Math.max(1, Math.round(job.outputHeight / step));
				canvas.width = width;
				canvas.height = height;
				context.fillStyle = "#fff";
				context.fillRect(0, 0, width, height);
				context.drawImage(image, 0, 0, width, height);
				const blob = job.maxEdge > 0
					? await canvasBlob(canvas, "image/jpeg", ${COVER_QUALITY})
					: await canvasBlob(canvas, "image/png");
				rungs.push({ url: await blobDataUrl(blob), width: width, height: height });
			}
			return rungs;
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
					const rungs = await raster(message.data, requestId);
					reply = { spool: RESULT, id: requestId, rungs };
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
 * The canvas shim (#8/#22), a classic script installed before any module so
 * timers are wrapped before frame code can take references. Speaks the host
 * protocol: {spool:"freeze"} stops time cooperatively — rAF callbacks held,
 * interval ticks skipped, running animations paused — so warm frames stay
 * real DOM, crisp at any zoom; {spool:"capture", id, maxEdge, settleMs}
 * answers with a sanitized foreignObject source for the trusted capture host
 * to rasterize off this frame's main thread. The frame waits out its own fonts
 * and entry animations first, and carries the faces it loaded in as data URIs,
 * because the isolated rasterization loads no external resources;
 * {spool:"pick", x, y} answers with the element ancestry at that frame-local
 * point — top-level element down to the deepest, each with its selector,
 * geometry, and nearest data-spool-source stamp (#23) — the canvas walks it
 * Figma-style (double-click descends, Esc ascends) without ever handing the
 * frame the pointer; {spool:"tree?"} answers with the whole live DOM below
 * the boot root, each element carrying its own stamp and whatever names it
 * (#55) — the inspector rail's elements tab reads it; {spool:"describe",
 * selectors} answers with one ancestry chain per selector so rail rows become
 * canvas selections;
 * {spool:"sites"} answers with the frame-local boxes of
 * navigation-site elements (#34) so arrows grow out of what causes them.
 * Entered frames also hand canvas-zoom gestures back across
 * the iframe boundary; ordinary wheel input stays inside the frame so its own
 * scroll surfaces remain real.
 */
const canvasShimJs = `(() => {
	let frozen = false;
	let paused = [];
	const heldRaf = [];
	const nativeRaf = window.requestAnimationFrame.bind(window);
	// Taken before any module evaluates, because the frame runtime's mock layer
	// replaces fetch and answers 404 to every route a scenario never declared —
	// the shim's own reads are spool's, not the frame's.
	const nativeFetch = window.fetch.bind(window);
	window.requestAnimationFrame = (cb) => {
		if (frozen) { heldRaf.push(cb); return 0; }
		return nativeRaf(cb);
	};
	const nativeSetInterval = window.setInterval.bind(window);
	window.setInterval = (fn, ms, ...args) => {
		if (typeof fn !== "function") return nativeSetInterval(fn, ms, ...args);
		return nativeSetInterval((...a) => { if (!frozen) fn(...a); }, ms, ...args);
	};

	function setFrozen(on) {
		if (frozen === on) return;
		frozen = on;
		try {
			if (on) {
				paused = document.getAnimations().filter((a) => a.playState === "running");
				for (const a of paused) a.pause();
			} else {
				for (const a of paused) { try { a.play(); } catch {} }
				paused = [];
			}
		} catch {}
		if (!on) for (const cb of heldRaf.splice(0)) nativeRaf(cb);
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
		// Chrome holds rAF entirely in an offscreen iframe, and the frames being
		// captured on their way out of the warm pool are exactly those — the race
		// is what keeps a goodbye shot inside its deadline.
		await new Promise((resolve) => {
			const timer = setTimeout(resolve, Math.max(0, Math.min(100, deadline - performance.now())));
			nativeRaf(() => nativeRaf(() => { clearTimeout(timer); resolve(); }));
		});
	}

	const SAFE_FONT_DATA_URL = /^data:font\\/(?:otf|ttf|woff2?);base64,[a-z0-9+/]+={0,2}$/i;

	function sanitizeCaptureClone(clone) {
		for (const element of clone.querySelectorAll(
			"audio, base, embed, frame, iframe, link, meta, object, script, source, track, video"
		)) {
			element.remove();
		}
		for (const style of clone.querySelectorAll("style")) {
			if (unsafeCaptureCss(style.textContent || "")) style.remove();
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
				if (
					value === "" ||
					value.startsWith("#") ||
					(name === "src" && /^data:image\\/(?:gif|jpeg|png|webp);base64,/i.test(value))
				) {
					continue;
				}
				element.removeAttribute(attribute.name);
			}
		}
	}

	function unsafeCaptureCss(value) {
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
			const safeFont = target.length <= 16 * 1024 * 1024 && SAFE_FONT_DATA_URL.test(target);
			if (!safeFragment && !safeFont) unsafe = true;
			return "";
		});
		return unsafe || /url\\s*\\(/i.test(remainder);
	}

	// maxEdge bounds the longest side in device pixels — a cover asks for one,
	// an export passes 0 and gets the frame at full device resolution.
	async function captureSource(maxEdge, settleMs) {
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
		// A cover is a boot placeholder, not an artifact: bounding its longest
		// edge turns a tall frame from a 12-megapixel lossless sheet into a few
		// tens of kilobytes. The white fill below means it never needs alpha, so
		// the bounded cover encodes as JPEG; an export still asks for lossless.
		// This ratio is the export's: a cover's rungs come off the frame's own
		// long edge, so what this document's window reports cannot soften them.
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const source = new Blob([svg], { type: "image/svg+xml" });
		if (source.size > 16 * 1024 * 1024) throw new Error("capture source too large");
		return { svg: source, width: W, height: H, dpr, maxEdge };
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

	// one line of words, collapsed and capped — a row label is a glance, not a paragraph
	function capped(raw) {
		const out = String(raw || "").replace(/\\s+/g, " ").trim();
		return out.length > 60 ? out.slice(0, 59) + "\\u2026" : out;
	}

	// direct text children only: a wrapper never wears its descendants' words
	function textOf(el) {
		let out = "";
		for (const node of el.childNodes) if (node.nodeType === 3) out += node.textContent;
		return capped(out);
	}

	// what names an element that has no words of its own (#55): the accessible
	// label its author already wrote — an icon button, an image, an input
	function labelOf(el) {
		return capped(
			el.getAttribute("aria-label") ||
			el.getAttribute("alt") ||
			el.getAttribute("title") ||
			el.getAttribute("placeholder") ||
			""
		);
	}

	// the live DOM below the boot root (#58): every element, its own stamp only —
	// grouping, boundaries, and which rows are named are the canvas's read of it
	function rawTree(el) {
		return {
			tag: el.tagName.toLowerCase(),
			selector: cssPath(el),
			source: el.getAttribute("data-spool-source"),
			text: textOf(el),
			label: labelOf(el),
			children: Array.from(el.children).map(rawTree),
		};
	}

	// where each navigation site's element sits (#34): stamp match first, and
	// for data-go sites the rendered attribute as fallback — component-wrapped
	// elements stamp where they are authored, which is not the site's file.
	// Answers are keyed by the anchor's own path:line:col, both sides' spelling.
	function siteBoxes(sites) {
		const byStamp = new Map();
		for (const el of document.querySelectorAll("[data-spool-source]")) {
			const stamp = el.getAttribute("data-spool-source");
			if (stamp && !byStamp.has(stamp)) byStamp.set(stamp, el);
		}
		const carriers = Array.from(document.querySelectorAll("[data-go]"));
		const claimed = new Set();
		const boxes = {};
		for (const site of Array.isArray(sites) ? sites : []) {
			if (!site || typeof site.path !== "string") continue;
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

	let captureInFlight = false;
	addEventListener("message", async (event) => {
		const m = event.data;
		if (!m || typeof m !== "object") return;
		if (m.spool === "freeze") { setFrozen(!!m.on); return; }
		if (m.spool === "pick") {
			const frame = (window.__SPOOL__ || {}).frame;
			let chain = [];
			try { chain = pickChain(m.x, m.y); } catch {}
			parent.postMessage({ spool: "picked", frame, id: m.id, chain }, "*");
			return;
		}
		if (m.spool === "sites") {
			const frame = (window.__SPOOL__ || {}).frame;
			let boxes = {};
			try { boxes = siteBoxes(m.sites); } catch {}
			parent.postMessage({ spool: "site-boxes", frame, id: m.id, boxes }, "*");
			return;
		}
		if (m.spool === "tree?") {
			const frame = (window.__SPOOL__ || {}).frame;
			let roots = [];
			try {
				const root = document.getElementById("root");
				roots = root ? Array.from(root.children).map(rawTree) : [];
			} catch {}
			parent.postMessage({ spool: "tree", frame, id: m.id, roots }, "*");
			return;
		}
		if (m.spool === "describe") {
			const frame = (window.__SPOOL__ || {}).frame;
			let chains = [];
			try {
				chains = (Array.isArray(m.selectors) ? m.selectors : []).map((sel) => {
					let el = null;
					try { el = typeof sel === "string" ? document.querySelector(sel) : null; } catch {}
					if (!el || el.id === "root") return [];
					return chainOf(el);
				});
			} catch {}
			parent.postMessage({ spool: "described", frame, id: m.id, chains }, "*");
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
			const maxEdge = m.maxEdge;
			const settleMs = m.settleMs;
			if (
				typeof maxEdge !== "number" ||
				!Number.isFinite(maxEdge) ||
				!Number.isInteger(maxEdge) ||
				maxEdge < 0 ||
				maxEdge > 16384 ||
				typeof settleMs !== "number" ||
				!Number.isFinite(settleMs) ||
				!Number.isInteger(settleMs) ||
				settleMs < 0 ||
				settleMs > 900
			) {
				throw new Error("invalid capture dimensions");
			}
			const source = await captureSource(maxEdge, settleMs);
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
		if (event.key === "Meta") {
			window.parent.postMessage({ spool: "modifier", frame, modifier: "Meta", held: true }, "*");
			return;
		}
		if (event.key === "Escape") {
			window.parent.postMessage({ spool: "key", frame, key: "Escape" }, "*");
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
		if (window.parent === window || event.key !== "Meta") return;
		window.parent.postMessage({
			spool: "modifier",
			frame: (window.__SPOOL__ || {}).frame,
			modifier: "Meta",
				held: false,
			}, "*");
		}, true);

	addEventListener("blur", () => {
		if (window.parent === window) return;
		window.parent.postMessage({
			spool: "modifier",
			frame: (window.__SPOOL__ || {}).frame,
			modifier: "Meta",
			held: false,
		}, "*");
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
