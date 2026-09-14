import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import type { Frame } from "playwright-core";
import { expect, it, onTestFinished } from "vitest";
import { testBrowser } from "../test-browser";
import { makeProject, makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { buildWebsite } from "./build";

it("runs cold destination modules, shared state, history, remounts, reload and visible failures statically", async () => {
	const { root } = makeProject(join(makeTempDir(), ".spool"));
	writeDesignFile(root, "shared/scenarios/default.json", '{"state":{"count":4}}');
	writeDesignFile(root, "shared/store.ts", "export const store={count:0};");
	writeFrame(
		root,
		"start",
		`import {useState} from 'react'; import {ui} from 'spool'; import {store} from '../../shared/store'; export const links={next:'next'} as const; export default function Start(){const [local,setLocal]=useState(0);return <main><h1>Start {String(ui.state.count)} shared {store.count} local {local}</h1><button onClick={()=>{store.count++;ui.state.count=Number(ui.state.count)+1;setLocal(local+1)}}>Increment</button><button data-go={links.next}>Next</button><button onClick={()=>ui.go(String(ui.state.unknown))}>Unknown</button><button onClick={()=>ui.copy("export proof").catch(()=>setLocal(99))}>Copy</button><a href="https://example.com">External</a></main>}`,
	);
	writeFrame(
		root,
		"next",
		`import {ui} from 'spool';import {store} from '../../shared/store';export default ()=> <main><h1>Next {String(ui.state.count)} shared {store.count}</h1><button onClick={()=>ui.back()}>Back</button></main>`,
	);
	writeDesignFile(root, "frames/next/frame.json", '{"w":390,"h":844}');
	const artifact = await buildWebsite({ root, entry: "start", version: "test" });
	const requests: string[] = [];
	let deny: string | undefined;
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? "/", "http://test").pathname.slice(1) || "index.html";
		requests.push(path);
		const object = path === deny ? undefined : artifact.objects.get(path);
		res.writeHead(object === undefined ? 404 : 200, { "Content-Type": object?.mediaType ?? "text/plain" });
		res.end(object?.bytes ?? "missing");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	onTestFinished(() => {
		server.closeAllConnections();
		return new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
	});
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("no server");
	const origin = `http://127.0.0.1:${address.port}`;
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
	await page.goto(origin);
	await expect.poll(() => page.locator("h1").textContent()).toBe("Start 4 shared 0 local 0");
	await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin });
	await page.getByText("Copy", { exact: true }).click();
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("export proof");
	await page.evaluate(() =>
		Object.defineProperty(navigator.clipboard, "writeText", {
			value: () => Promise.reject(new DOMException("Denied", "NotAllowedError")),
		}),
	);
	await page.getByText("Copy", { exact: true }).click();
	await expect.poll(() => page.locator("h1").textContent()).toContain("local 99");
	await page.route("https://example.com/", (route) =>
		route.fulfill({ body: "External page", contentType: "text/html" }),
	);
	await page.getByText("External", { exact: true }).click();
	await page.waitForURL("https://example.com/");
	await page.goto(origin);
	const next = artifact.manifest.frames.find((frame) => frame.name === "next");
	if (next === undefined) throw new Error("no next");
	expect(requests).not.toContain(next.module);
	await page.getByText("Increment", { exact: true }).click();
	await page.getByText("Next", { exact: true }).click();
	await expect.poll(() => page.locator("h1").textContent()).toBe("Next 5 shared 1");
	expect(requests).toContain(next.module);
	await page.getByText("Back", { exact: true }).click();
	await expect.poll(() => page.locator("h1").textContent()).toBe("Start 5 shared 1 local 0");
	await page.goForward();
	await expect.poll(() => page.locator("h1").textContent()).toBe("Next 5 shared 1");
	await page.reload();
	await expect.poll(() => page.locator("h1").textContent()).toBe("Next 4 shared 0");
	await page.goto(origin);
	await page.getByText("Unknown", { exact: true }).click();
	await expect.poll(() => page.getByRole("alert").textContent()).toContain("not included");
	expect(await page.locator("h1").textContent()).toBe("Start 4 shared 0 local 0");
	await page.goto(`${origin}/?frame=missing`);
	await expect.poll(() => page.getByRole("alert").textContent()).toContain("not available");
	await page.goto(origin);
	deny = next.module;
	await page.getByText("Next", { exact: true }).click();
	await expect.poll(() => page.getByRole("alert").count()).toBe(1);
	expect(await page.locator("h1").textContent()).toBe("Start 4 shared 0 local 0");
	const entry = artifact.manifest.frames.find((frame) => frame.name === "start");
	deny = entry?.module;
	await page.goto(origin);
	await expect.poll(() => page.locator("body").textContent()).toContain("could not");
}, 30000);

it("matches standalone and local-player pixels at equal viewports with fonts, images and frame styles", async () => {
	const project = await serveProject();
	writeDesignFile(project.root, "shared/fonts.css", '@font-face{font-family:Fixture;src:url("./fixture.woff2")}');
	writeFileSync(
		join(project.root, "design/shared/fixture.woff2"),
		readFileSync(
			new URL(
				"../../node_modules/@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff2",
				import.meta.url,
			),
		),
	);
	writeDesignFile(
		project.root,
		"shared/image.svg",
		'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="red"/></svg>',
	);
	for (const name of ["start", "next"]) {
		writeFrame(
			project.root,
			name,
			`import image from '../../shared/image.svg';import './style.css';export default ()=> <main id="probe" className="p-8"><h1>Font geometry</h1><img src={image}/><button data-go="${name === "start" ? "next" : "start"}">Walk</button></main>`,
		);
		writeDesignFile(
			project.root,
			`frames/${name}/style.css`,
			`#probe{min-height:100vh;background:${name === "start" ? "#dec" : "#cde"};font-family:Fixture}h1{font-size:24px;line-height:32px}`,
		);
		writeDesignFile(
			project.root,
			`frames/${name}/frame.json`,
			JSON.stringify({ w: name === "start" ? 800 : 390, h: name === "start" ? 600 : 844 }),
		);
	}
	const artifact = await buildWebsite({ root: project.root, entry: "start", version: "test" });
	const server = createServer((req, res) => {
		const path = new URL(req.url ?? "/", "http://test").pathname.slice(1) || "index.html";
		const object = artifact.objects.get(path);
		res.writeHead(object ? 200 : 404, { "Content-Type": object?.mediaType ?? "text/plain" });
		res.end(object?.bytes);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	onTestFinished(() => {
		server.closeAllConnections();
		return new Promise<void>((resolve) => server.close(() => resolve()));
	});
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("no server");
	const browser = await testBrowser();
	const context = await browser.newContext({ viewport: { width: 800, height: 600 }, reducedMotion: "reduce" });
	const published = await context.newPage();
	await published.goto(`http://127.0.0.1:${address.port}`);
	const measure = async (frame: Frame) => {
		await frame.locator("#probe").waitFor();
		await frame.evaluate(() => document.fonts.ready);
		return frame.locator("#probe").evaluate((element) => {
			const rect = element.getBoundingClientRect();
			const heading = element.querySelector("h1");
			return {
				width: rect.width,
				height: rect.height,
				background: getComputedStyle(element).backgroundColor,
				font: heading && getComputedStyle(heading).fontFamily,
				headingWidth: heading?.getBoundingClientRect().width,
				image: element.querySelector("img")?.naturalWidth,
				viewport: [innerWidth, innerHeight],
			};
		});
	};
	for (const name of ["start", "next"]) {
		if (name === "next") await published.getByText("Walk", { exact: true }).click();
		await expect
			.poll(() => published.locator("#probe").evaluate((element) => getComputedStyle(element).backgroundColor))
			.toBe(name === "start" ? "rgb(221, 238, 204)" : "rgb(204, 221, 238)");
		const actual = await measure(published.mainFrame());
		expect(actual.image).toBe(24);
		expect(actual.font).toBe("Fixture");
		expect(actual.viewport).toEqual([800, 600]);
		const bare = await context.newPage();
		await bare.goto(`${project.renderUrl}/p/${encodeURIComponent(project.name)}/frames/${name}`);
		expect(await measure(bare.mainFrame())).toEqual(actual);
		await published.mouse.move(799, 599);
		await published.evaluate(() => {
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		});
		const barePixels = await bare.locator("#probe").screenshot();
		const publicPixels = await published.locator("#probe").screenshot();
		const pixels = (bytes: Buffer) =>
			published.evaluate(async (encoded) => {
				const image = new Image();
				image.src = `data:image/png;base64,${encoded}`;
				await image.decode();
				const canvas = document.createElement("canvas");
				canvas.width = image.width;
				canvas.height = image.height;
				const context = canvas.getContext("2d");
				if (context === null) throw new Error("no image context");
				context.drawImage(image, 0, 0);
				const digest = await crypto.subtle.digest(
					"SHA-256",
					context.getImageData(0, 0, image.width, image.height).data,
				);
				return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
			}, bytes.toString("base64"));
		expect(await pixels(barePixels)).toBe(await pixels(publicPixels));
		const player = await context.newPage();
		await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=${name}`);
		await player.frameLocator("#spool-player").locator("#probe").waitFor();
		const inner = player.frames().find((frame) => frame !== player.mainFrame());
		if (!inner) throw new Error("missing player");
		await player.locator("#spool-player").evaluate((element) => {
			element.setAttribute("style", "width:800px;height:600px;position:fixed;inset:0;border:0;transform:none");
		});
		expect(await measure(inner)).toEqual(actual);
		await bare.close();
		await player.close();
	}
}, 60000);
