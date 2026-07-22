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
	// config and shim ride classic scripts so both exist before any module evaluates
	return htmlShell(
		frame,
		`<script>window.__SPOOL__ = ${escapeJsonScript({ project, frame })}</script>
<script>${escapeInlineScript(canvasShimJs)}</script>
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
 * {spool:"pick", x, y} answers with the element at that frame-local point —
 * its selector, geometry, and nearest data-spool-source stamp (#23), the
 * canvas's design-mode select without ever handing the frame the pointer.
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

	function pick(x, y) {
		const el = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
		if (!el || el === document.documentElement || el === document.body || el.id === "root") return null;
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

	addEventListener("message", async (event) => {
		const m = event.data;
		if (!m || typeof m !== "object") return;
		if (m.spool === "freeze") { setFrozen(!!m.on); return; }
		if (m.spool === "pick") {
			const frame = (window.__SPOOL__ || {}).frame;
			let hit = null;
			try { hit = pick(m.x, m.y); } catch {}
			parent.postMessage({ spool: "picked", frame, hit }, "*");
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

	// an entered frame owns the pointer AND the keyboard — Esc must still exit
	// (#22), so the one exit key is forwarded to the host
	addEventListener("keydown", (event) => {
		if (event.key !== "Escape" || parent === window) return;
		parent.postMessage({ spool: "key", frame: (window.__SPOOL__ || {}).frame, key: "Escape" }, "*");
	});
})();
`;

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
