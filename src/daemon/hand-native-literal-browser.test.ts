import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

const requested = "\" ' & < > { } \\ \n\r\t\u2028\u2029 😀";
const cases = [
	{ name: "JSX text", kind: "text", jsx: "<button>Buy</button>" },
	{ name: "double string child", kind: "text", jsx: '<button>{"Buy"}</button>' },
	{ name: "single string child", kind: "text", jsx: "<button>{'Buy'}</button>" },
	{ name: "mixed children and comment", kind: "text", jsx: '<button>Buy{/* keep */}{" now"}</button>' },
	{ name: "empty paired children", kind: "text", jsx: "<button></button>" },
	{ name: "multiline JSX normalization", kind: "text", jsx: "<button>\n  Buy\n  now\n</button>" },
	{ name: "double attribute", kind: "attribute", jsx: '<button title="Before">Buy</button>' },
	{ name: "single attribute", kind: "attribute", jsx: "<button title='Before'>Buy</button>" },
	{ name: "double expression attribute", kind: "attribute", jsx: '<button title={"Before"}>Buy</button>' },
	{ name: "single expression attribute", kind: "attribute", jsx: "<button title={'Before'}>Buy</button>" },
	{ name: "missing attribute", kind: "attribute", jsx: "<button>Buy</button>" },
];

it.each(cases)(
	"literal $name saves every escape and restores exact source and React child shape",
	{ timeout: 120000 },
	async ({ kind, jsx }) => {
		const source = `export default function Frame(){const label=${jsx.replace("<button", '<button id="label" style={{width:240,height:60}}')};globalThis.literalShape=JSON.stringify({owns:Object.hasOwn(label.props,'children'),children:label.props.children});return <main style={{padding:40}}>{label}<input id="draft" defaultValue="initial"/></main>}`;
		const uiDir = join(makeTempDir(), "ui");
		const project = await serveProject({ uiDir });
		writeFrame(project.root, "home", source);
		writeDesignFile(project.root, "frames/home/frame.json", '{"x":0,"y":0,"w":700,"h":500}');
		writeDesignFile(project.root, ".spool/state.json", '{"camera":{"x":60,"y":60,"k":1}}');
		await buildUi({
			configFile: join(process.cwd(), "vite.config.ts"),
			logLevel: "silent",
			build: { outDir: uiDir, emptyOutDir: true },
		});
		const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
		onTestFinished(() => browser.close());
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		await page.goto(`${project.url}/p/${project.name}`);
		const frame = page.frameLocator('iframe[title="home"]');
		const label = frame.locator("#label");
		await expect.poll(() => label.count(), { timeout: 30000 }).toBe(1);
		const ordinary = await build({
			stdin: {
				contents: `import {createRoot} from 'react-dom/client';${source.replace("export default", "")}createRoot(document.getElementById('root')).render(<Frame/>);`,
				resolveDir: process.cwd(),
				loader: "tsx",
			},
			bundle: true,
			write: false,
			format: "iife",
			jsx: "automatic",
		});
		const oracle = await browser.newPage();
		await oracle.setContent('<div id="root"></div>');
		await oracle.addScriptTag({ content: ordinary.outputFiles[0]?.text ?? "" });
		await expect.poll(() => oracle.locator("#label").count()).toBe(1);
		const shape = await oracle.evaluate(() => Reflect.get(globalThis, "literalShape"));
		expect(await label.evaluate(() => Reflect.get(globalThis, "literalShape"))).toBe(shape);
		const before = kind === "text" ? await label.textContent() : await label.getAttribute("title");
		await frame.locator("#draft").fill("kept independent");
		const box = await label.boundingBox();
		if (!box) throw new Error("literal has no box");
		await page.keyboard.down(process.platform === "darwin" ? "Meta" : "Control");
		await page.mouse.click(box.x + 20, box.y + 20);
		await page.keyboard.up(process.platform === "darwin" ? "Meta" : "Control");
		const control = page.getByRole("textbox", { name: kind === "text" ? "Text" : "title", exact: true });
		await expect.poll(() => control.count()).toBe(1);
		// Exercise the daemon's complete string domain at its actual hand-operation
		// boundary. Native single-line attributes sanitize CR/LF before this boundary.
		// The original browser read, preview, save, admission and delivery stay real.
		await page.route("**/source", async (route) => {
			const request = route.request();
			const body = request.postDataJSON();
			if (body?.action !== "commit") return route.continue();
			if (body.change?.kind !== "literal" || typeof body.change.text !== "string")
				throw new Error("unexpected literal operation");
			body.change.text = requested;
			await route.continue({ postData: JSON.stringify(body) });
		});
		await control.fill("new requested text");
		await control.press("Enter");
		const file = join(project.root, "design/frames/home/frame.tsx");
		await expect.poll(() => readFileSync(file, "utf8")).not.toBe(source);
		await expect.poll(() => (kind === "text" ? label.textContent() : label.getAttribute("title"))).toBe(requested);
		await expect.poll(() => page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		expect(await frame.locator("#draft").inputValue()).toBe("kept independent");
		await page.mouse.click(5, 5);
		await page.keyboard.press("ControlOrMeta+z");
		await expect.poll(() => readFileSync(file, "utf8")).toBe(source);
		await expect.poll(() => (kind === "text" ? label.textContent() : label.getAttribute("title"))).toBe(before);
		expect(await label.evaluate(() => Reflect.get(globalThis, "literalShape"))).toBe(shape);
		expect(await frame.locator("#draft").inputValue()).toBe("kept independent");
		await expect.poll(() => page.locator('[data-hand-notice="saving"]').count()).toBe(0);
		await page.mouse.click(5, 5);
		await page.keyboard.press("ControlOrMeta+Shift+z");
		await expect.poll(() => (kind === "text" ? label.textContent() : label.getAttribute("title"))).toBe(requested);
		expect(await frame.locator("#draft").inputValue()).toBe("kept independent");
	},
);
