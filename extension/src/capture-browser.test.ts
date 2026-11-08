import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { build } from "esbuild";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { ReferenceCapture } from "../../src/reference-wire";
import { testBrowser } from "../../src/test-browser";

/** two origins: the page's, and another that serves a sheet without CORS, which the tab may not read */
let page: Server;
let other: Server;
const at = (s: Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;

function serve(routes: Record<string, [string, string]>): Promise<Server> {
	const s = createServer((req, res) => {
		const hit = routes[req.url ?? ""];
		if (hit === undefined) return void res.writeHead(404).end();
		res.writeHead(200, { "content-type": hit[0] }).end(hit[1]);
	});
	return new Promise((ok) => s.listen(0, "127.0.0.1", () => ok(s)));
}

const FIXTURE = (otherOrigin: string) => `<!doctype html>
<html class="dark" data-theme="night" lang="en">
<head>
	<link rel="stylesheet" href="/site.css">
	<link rel="stylesheet" href="/faces.css">
	<link rel="stylesheet" href="${otherOrigin}/fonts.css" media="screen">
	<style>@import url("/imported.css"); .pricing .card { color: red; }</style>
</head>
<body class="home" style="--brand: #f40">
	<main class="page">
		<section class="pricing" id="pick" onclick="alert(1)">
			<script>window.ran = true</script>
			<noscript><p>no script</p></noscript>
			<a href="javascript:alert(1)">bad</a>
			<a href="/plans" onmouseover="x()">Plans</a>
			<img src="/a.png" srcset="/a.png 1x, /b.png 2x" loading="lazy" alt="">
			<input id="email" value="old">
			<input id="agree" type="checkbox">
			<input id="secret" type="password">
			<select><option>one</option><option id="two">two</option></select>
			<textarea id="note"></textarea>
			<x-card></x-card>
			<x-player poster="/poster.jpg" style="object-fit: cover"></x-player>
			<div class="spinner"></div>
			<canvas id="drawn" width="8" height="8"></canvas><canvas id="empty" width="8" height="8"></canvas>
		</section>
	</main>
</body>
</html>`;

async function openTab() {
	const bundle = await build({
		entryPoints: [new URL("./capture.ts", import.meta.url).pathname],
		bundle: true,
		write: false,
		format: "iife",
		globalName: "spoolCapture",
	});
	const browser = await testBrowser();
	const tab = await browser.newPage({ viewport: { width: 1200, height: 800 } });
	await tab.goto(`${at(page)}/`);
	await tab.addScriptTag({ content: bundle.outputFiles[0]?.text ?? "" });
	return tab;
}

async function captured(whole: boolean): Promise<ReferenceCapture> {
	return (await openTab()).evaluate(async (whole) => {
		// what a person did on the page before picking it
		(document.querySelector("#email") as HTMLInputElement).value = "liam@example.com";
		(document.querySelector("#agree") as HTMLInputElement).checked = true;
		(document.querySelector("#secret") as HTMLInputElement).value = "hunter2";
		(document.querySelector("#two") as HTMLOptionElement).selected = true;
		(document.querySelector("#note") as HTMLTextAreaElement).value = "a <note>";
		const card = document.querySelector("x-card") as HTMLElement;
		const root = card.attachShadow({ mode: "open" });
		const sheet = new CSSStyleSheet();
		sheet.replaceSync(":host { display: block; padding: 4px }");
		root.adoptedStyleSheets = [sheet];
		root.innerHTML = `<style>b { color: blue }</style><b part="price">$12</b><slot></slot>`;
		// started from script, as Framer Motion does: it must keep playing
		document
			.querySelector(".spinner")
			?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)", offset: 1 }], {
				duration: 800,
				iterations: Number.POSITIVE_INFINITY,
				easing: "ease-in-out",
				direction: "alternate",
			});
		const pen = (document.querySelector("#drawn") as HTMLCanvasElement).getContext("2d");
		if (pen !== null) pen.fillRect(3, 3, 1, 1);
		await document.fonts.ready;
		const capture = (globalThis as unknown as { spoolCapture: typeof import("./capture") }).spoolCapture.capture;
		const el = whole ? document.body : (document.querySelector("#pick") as Element);
		return capture({ el, whole, label: whole ? location.host : "section.pricing" });
	}, whole);
}

beforeAll(async () => {
	other = await serve({ "/fonts.css": ["text/css", "@font-face { font-family: X; src: url(x.woff2) }"] });
	page = await serve({
		"/": ["text/html", FIXTURE(at(other))],
		"/site.css": ["text/css", ".page { background: url(bg.png) }"],
		"/imported.css": ["text/css", ".imported { color: green }"],
		"/faces.css": [
			"text/css",
			"@font-face { font-family: Used; src: url(used.woff2) } @font-face { font-family: Idle; src: url(idle.woff2) } .pricing { font-family: Used }",
		],
		"/a.png": ["image/png", ""],
	});
});

afterAll(() => {
	page?.close();
	other?.close();
});

it("serializes a picked element without its scripts, as it stands, inside its ancestors", {
	timeout: 60_000,
}, async () => {
	const c = await captured(false);

	// no script of any kind comes
	expect(c.html).not.toMatch(/<script|<noscript|onclick|onmouseover|javascript:/i);
	// the ancestors, shallow and out of the layout's way, so `.page .pricing` still matches
	expect(c.html.startsWith('<main class="page" style="display: contents !important">')).toBe(true);
	expect(c.html.split(" data-spool-reference").length).toBe(2);
	expect(c.html).toContain('<section class="pricing" id="pick" data-spool-reference>');
	// what the person typed and chose, and the source the browser picked; never a password
	expect(c.html).toContain('value="liam@example.com"');
	expect(c.html).toMatch(/id="agree" type="checkbox" checked/);
	expect(c.html).toMatch(/<option id="two" selected>/);
	expect(c.html).toContain("a &lt;note&gt;</textarea>");
	expect(c.html).not.toContain("hunter2");
	expect(c.html).toContain(`<img src="${at(page)}/a.png" alt>`);
	expect(c.html).toContain(`href="${at(page)}/plans"`);
	// an open shadow root, declaratively, with its own sheets
	expect(c.html).toContain(
		'<x-card><template shadowrootmode="open"><style>:host { display: block; padding: 4px; }</style><style>b { color: blue }</style><b part="price">$12</b><slot></slot></template></x-card>',
	);

	// a player whose video plays in another site's frame shows its poster
	expect(c.html).toContain(
		`<x-player poster="${at(page)}/poster.jpg" style="object-fit: cover; background: url(&quot;${at(page)}/poster.jpg&quot;) center / cover no-repeat"></x-player>`,
	);
	// a canvas as the picture it shows; one that reads back empty (as WebGL does once drawn) left out, with a note
	expect(c.html).toMatch(
		/<canvas id="drawn" width="8" height="8" style="background: url\(&quot;data:image\/png;base64,/,
	);
	expect(c.html).toContain('<canvas id="empty" width="8" height="8"></canvas>');
	expect(c.notes).toEqual(["A canvas read back empty (WebGL keeps no copy of what it drew), so it is left out."]);

	// the page's context
	expect(c.htmlAttrs).toEqual({ class: "dark", "data-theme": "night", lang: "en" });
	expect(c.bodyAttrs).toEqual({ class: "home", style: "--brand: #f40" });
	expect(c.size).toMatchObject({ w: expect.any(Number), h: expect.any(Number) });
	expect(c.viewport).toEqual({ w: 1200, h: 800 });

	// every sheet in order: read where the tab may, the other origin's left for the daemon to fetch
	expect(c.styles).toEqual([
		{ kind: "text", text: '.page { background: url("bg.png"); }', base: `${at(page)}/site.css` },
		expect.objectContaining({ kind: "text", base: `${at(page)}/faces.css` }),
		{ kind: "link", href: `${at(other)}/fonts.css`, media: "screen" },
		{ kind: "text", text: ".imported { color: green; }", base: `${at(page)}/imported.css` },
		{ kind: "text", text: ".pricing .card { color: red; }", base: `${at(page)}/` },
	]);

	// a face the page declared and never loaded, for the daemon to leave on the web
	expect(c.unusedFonts).toEqual([`${at(page)}/idle.woff2`]);

	// the script-started spin, as keyframes on an attribute the markup carries
	expect(c.html).toContain('<div class="spinner" data-spool-anim="a1">');
	expect(c.animations).toContain(
		"@keyframes spool-anim-1 {\n  0% { transform: rotate(0deg) }\n  100% { transform: rotate(360deg) }\n}",
	);
	expect(c.animations).toMatch(
		/\[data-spool-anim="a1"\] \{ animation: spool-anim-1 800ms ease-in-out -?[\d.]+ms infinite alternate none running !important; \}/,
	);
});

it("keeps a picked element's top where its content starts, wherever its first child's margin went", {
	timeout: 60_000,
}, async () => {
	const fixes = await (await openTab()).evaluate(() => {
		document.body.innerHTML = `
			<div id="escapes"><div><div style="margin-top: 200px">hero</div></div></div>
			<div id="padded" style="padding-top: 1px"><p style="margin-top: 40px">a</p></div>
			<div style="display: flex"><div id="item"><p style="margin-top: 40px">b</p></div></div>
			<div id="worded">words<p style="margin-top: 40px">c</p></div>`;
		const { standAlone } = (globalThis as unknown as { spoolCapture: typeof import("./capture") }).spoolCapture;
		return ["escapes", "padded", "item", "worded"].map((id) => standAlone(document.getElementById(id) as Element));
	});
	expect(fixes).toEqual([["margin-top: -200px !important"], [], ["display: flow-root !important"], []]);
});

it("serializes the whole page as its body, marked", { timeout: 60_000 }, async () => {
	const c = await captured(true);
	expect(c.whole).toBe(true);
	expect(c.bodyAttrs["data-spool-reference"]).toBe("");
	expect(c.html.trimStart().startsWith('<main class="page">')).toBe(true);
	expect(c.size.w).toBe(1200);
});
