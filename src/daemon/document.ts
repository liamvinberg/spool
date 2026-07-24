import { createHash } from "node:crypto";

/**
 * Assembly of the served frame document. Spool owns the whole page (#16):
 * frames carry zero boilerplate, so everything a component needs to render —
 * finished CSS, fonts, import map, boot module — is injected here, inline,
 * as one sealed sandboxable document.
 */

export interface FrameDocumentParts {
	project: string;
	frame: string;
	/** Compiled Tailwind output: theme vars, preflight, used utilities. */
	css: string;
	/** shared/fonts.css verbatim, when the file exists. */
	fonts?: string | undefined;
	/** Extra stylesheet emitted by the frame bundle (plain .css imports). */
	bundledCss?: string | undefined;
	importMap: object;
	bootJs: string;
}

export function assembleFrameDocument({
	project,
	frame,
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
		`<script>window.__SPOOL__ = ${escapeJsonScript({ project, frame })}</script>
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
 * real DOM, crisp at any zoom; {spool:"capture"} answers with a foreignObject
 * self-rasterization, the ambient thumbnail path (Playwright is the fallback);
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

	async function selfCapture() {
		const W = document.documentElement.clientWidth || innerWidth;
		const H = document.documentElement.clientHeight || innerHeight;
		const clone = document.documentElement.cloneNode(true);
		clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
		const srcInputs = document.querySelectorAll("input, textarea");
		const dstInputs = clone.querySelectorAll("input, textarea");
		srcInputs.forEach((el, i) => { const d = dstInputs[i]; if (d) d.setAttribute("value", el.value); });
		const srcCanvas = document.querySelectorAll("canvas");
		const dstCanvas = clone.querySelectorAll("canvas");
		srcCanvas.forEach((c, i) => {
			const d = dstCanvas[i];
			if (!d || !d.parentNode) return;
			const img = document.createElement("img");
			img.setAttribute("src", c.toDataURL());
			img.setAttribute("style", (c.getAttribute("style") || "") + ";width:" + c.clientWidth + "px;height:" + c.clientHeight + "px");
			d.parentNode.replaceChild(img, d);
		});
		for (const s of clone.querySelectorAll("script")) s.remove();
		const xml = new XMLSerializer().serializeToString(clone);
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">'
			+ '<foreignObject width="100%" height="100%">' + xml + "</foreignObject></svg>";
		const img = new Image();
		img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
		await img.decode();
		const scale = Math.min(window.devicePixelRatio || 1, 2);
		const cv = document.createElement("canvas");
		cv.width = W * scale;
		cv.height = H * scale;
		const ctx = cv.getContext("2d");
		ctx.scale(scale, scale);
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, W, H);
		ctx.drawImage(img, 0, 0);
		return cv.toDataURL("image/png");
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
		const frame = (window.__SPOOL__ || {}).frame;
		try {
			const url = await selfCapture();
			parent.postMessage({ spool: "shot", frame, url }, "*");
		} catch (error) {
			parent.postMessage({ spool: "shot", frame, error: String(error) }, "*");
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
export function errorDocument(frame: string, message: string): string {
	const report = `if (parent !== window) parent.postMessage({ spool: "error", frame: ${JSON.stringify(frame)}, error: ${JSON.stringify(message)} }, "*");`;
	return htmlShell(
		frame,
		`<style>
body { margin: 0; padding: 24px; background: #111110; color: #b5b3ad; font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; }
h1 { margin: 0 0 16px; font-size: 13px; font-weight: 400; color: #f5391a; }
pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
</style>
`,
		`<h1>${escapeHtml(frame)} failed to compile</h1>
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
export function escapeJsonScript(value: object): string {
	return JSON.stringify(value).replaceAll("<", "\\u003c");
}
