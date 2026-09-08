import { readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { build } from "esbuild";
import { chromium, type Page } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, onTestFinished } from "vitest";
import type { SourceRead } from "../source-edit";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

export async function originCanvas(
	files: Record<string, string>,
	frameSource: string,
	selector: string,
	shared = false,
	beforeLoad?: (page: Page) => Promise<void>,
	agentEngines?: NonNullable<Parameters<typeof serveProject>[0]>["agentEngines"],
) {
	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir, ...(agentEngines ? { agentEngines } : {}) });
	for (const [path, source] of Object.entries(files)) writeDesignFile(project.root, path, source);
	writeFrame(project.root, "home", frameSource);
	writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":650,"h":500}');
	if (shared) {
		writeFrame(project.root, "second", frameSource);
		writeDesignFile(project.root, "frames/second/frame.json", '{"x":700,"y":0,"w":450,"h":500}');
	}
	writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":60,"y":60,"k":1}}');
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	onTestFinished(() => browser.close());
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	const writes: string[] = [];
	page.on("request", (request) => {
		if (request.url().endsWith("/source")) {
			const action: unknown = request.postDataJSON()?.action;
			if (action === "commit" || action === "inverse") writes.push(action);
		}
	});
	await page.addInitScript(() => {
		const outcomes: unknown[] = [];
		Reflect.set(window, "originOutcomes", outcomes);
		addEventListener("message", (event) => {
			const data = event.data;
			if (data?.spool === "source-reply" && data.result?.installation) outcomes.push(data.result);
		});
	});
	await beforeLoad?.(page);
	await page.goto(`${project.url}/p/${project.name}`);
	const frame = page.frameLocator('iframe[title="home"]');
	const target = frame.locator(selector).first();
	await expect.poll(() => target.count(), { timeout: 30_000 }).toBe(1);
	const file = (path: string) => join(project.root, "design", path);
	const bytes = () => Object.fromEntries(Object.keys(files).map((path) => [path, readFileSync(file(path), "utf8")]));
	const select = async () => {
		// A native edit closes before React releases the iframe's pointer.
		// Canvas selection must start after that observable ownership transition.
		await expect
			.poll(() =>
				page.locator('iframe[title="home"]').evaluate((element) => getComputedStyle(element).pointerEvents),
			)
			.toBe("none");
		const box = await target.boundingBox();
		if (!box) throw new Error("target has no box");
		await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
		await page.mouse.click(box.x + 8, box.y + box.height / 2);
		await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
		await expect
			.poll(async () => {
				const response = await fetch(`${project.url}/api/p/${project.name}/selection`, {
					headers: { "X-Spool-Control": project.controlToken },
				});
				const body = (await response.json()) as { selection?: unknown[] };
				return body.selection?.length;
			})
			.toBe(1);
		return box;
	};
	const edit = async () => {
		const box = await select();
		const pending = page.waitForResponse(
			(response) => response.url().endsWith("/source") && response.request().postDataJSON()?.action === "read",
		);
		await page.mouse.click(box.x + 8, box.y + box.height / 2);
		const result = (await (await pending).json()) as { ok: boolean; read?: SourceRead; reason?: string };
		expect(result.ok, result.reason).toBe(true);
		if (!result.read) throw new Error("no source read");
		await expect.poll(() => target.getAttribute("contenteditable")).toBe("plaintext-only");
		return result.read;
	};
	const history = async (redo = false) => {
		await page.mouse.click(800, 700);
		await page.keyboard.press(redo ? "ControlOrMeta+Shift+z" : "ControlOrMeta+z");
	};
	const settled = async () => {
		await expect
			.poll(() => page.evaluate(() => Reflect.get(window, "originOutcomes").length), { timeout: 15_000 })
			.toBe(writes.length * (shared ? 2 : 1));
		await expect.poll(() => page.locator('[data-hand-notice="saving"]').count(), { timeout: 15_000 }).toBe(0);
	};
	return { project, browser, page, frame, target, file, bytes, select, edit, history, settled, writes };
}

// The comparison app has ordinary React and stable authored component functions.
// Its one editable fixture input is a module value updated before root.render;
// it never supplies source ownership, compiler facts, or a write implementation.
export async function originOracle(
	canvas: Awaited<ReturnType<typeof originCanvas>>,
	files: Record<string, string>,
	entry: string,
) {
	const bundle = await build({
		logLevel: "silent",
		define: { "process.env.NODE_ENV": '"production"' },
		stdin: {
			contents: `import {createRoot} from 'react-dom/client';import {createElement} from 'react';import {flushSync} from 'react-dom';import Frame from '${entry}';const root=createRoot(document.getElementById('root'));globalThis.oracleRender=()=>flushSync(()=>root.render(createElement(Frame)));globalThis.oracleRender();`,
			loader: "js",
			resolveDir: process.cwd(),
		},
		bundle: true,
		write: false,
		format: "iife",
		jsx: "automatic",
		plugins: [
			{
				name: "ordinary-authored-fixtures",
				setup(bundler) {
					bundler.onResolve({ filter: /^(shared\/|\.\/|\.\.\/)/ }, (args) => {
						if (args.path.startsWith(".") && args.namespace !== "fixture") return undefined;
						const base = args.path.startsWith(".")
							? posix.normalize(posix.join(dirname(args.importer), args.path))
							: args.path;
						const path = [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find(
							(path) => files[path] !== undefined,
						);
						return path ? { path, namespace: "fixture" } : undefined;
					});
					bundler.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
						contents: files[args.path] ?? "",
						loader: "tsx",
						resolveDir: process.cwd(),
					}));
				},
			},
		],
	});
	const page = await canvas.browser.newPage();
	await page.setContent('<div id="root"></div>');
	await page.addScriptTag({ content: bundle.outputFiles[0]?.text ?? "" });
	return page;
}
