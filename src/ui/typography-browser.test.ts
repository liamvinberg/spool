import { build } from "esbuild";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeFrame } from "../test-helpers";

function luminance(color: string): number {
	const channels = color
		.match(/[\d.]+/g)
		?.slice(0, 3)
		.map(Number);
	if (channels?.length !== 3) throw new Error(`Expected RGB colour: ${color}`);
	return channels.reduce((sum, value, index) => {
		const v = value / 255;
		const linear = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
		return sum + linear * [0.2126, 0.7152, 0.0722][index]!;
	}, 0);
}

it("loads real typefaces and keeps prose, names and supporting text readable", { timeout: 120_000 }, async () => {
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });
	writeFrame(
		project.root,
		"checkout--empty",
		'export default function Frame() { return <main style={{ fontFamily: "Georgia" }}><p>Sample frame</p><a href="https://example.com">External link</a></main>; }',
	);
	const browser = await testBrowser();
	const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
	await page.goto(`${project.url}/p/${project.name}`, { waitUntil: "domcontentloaded" });
	await page.getByRole("heading", { name: "Pages", exact: true }).waitFor();

	const bundle = await build({
		stdin: {
			contents: `import { createRoot } from "react-dom/client";
import { Said } from "./src/ui/canvas/agent-said";
import { MenuItem } from "./src/ui/canvas/context-menu";
const root = document.createElement("section");
root.id = "type-specimen";
root.style.cssText = "position:fixed;inset:60px auto auto 20px;z-index:9999;width:420px;padding:16px";
root.className = "bg-bg text-text";
document.body.append(root);
createRoot(root).render(<>
 <h2 className="type-title font-semibold">Properties</h2>
 <Said text={"Åsa’s café order is **ready**. Keep the *emphasis* and open \`checkout--delivery-instructions-with-extra-notes\`."} />
 <p id="type-name" className="type-value truncate">checkout--delivery-instructions-with-extra-notes</p>
 <p id="type-detail" className="type-detail text-muted">4 changes · 18s</p>
 <textarea aria-label="Message" className="type-body text-text bg-surface placeholder:text-muted w-full" placeholder="Say what to change" />
 <div role="menu"><MenuItem label="Open frame" keys="↵" onClick={() => {}} /></div>
</>);`,
			resolveDir: process.cwd(),
			loader: "tsx",
		},
		bundle: true,
		write: false,
		format: "iife",
		jsx: "automatic",
		define: { "process.env.NODE_ENV": '"production"' },
	});
	await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
	await page.locator("#type-detail").waitFor();
	await page.evaluate(() => document.fonts.ready);
	const metrics = await page.locator("#type-specimen").evaluate((root) => {
		const style = (selector: string) => {
			const element = root.querySelector(selector);
			if (element === null) throw new Error(`Missing ${selector}`);
			const css = getComputedStyle(element);
			return {
				family: css.fontFamily,
				size: css.fontSize,
				line: css.lineHeight,
				weight: css.fontWeight,
				style: css.fontStyle,
				features: css.fontFeatureSettings,
			};
		};
		return {
			body: style(".type-body"),
			code: style("code"),
			detail: style("#type-detail"),
			title: style("h2"),
			bold: style("strong"),
			italic: style(".italic"),
			menu: style("[role=menuitem]"),
			fonts: [...document.fonts]
				.filter((font) => font.status === "loaded")
				.map((font) => ({ family: font.family, style: font.style })),
		};
	});
	expect(metrics.body).toMatchObject({
		family: '"Instrument Sans Variable", system-ui, sans-serif',
		size: "14px",
		line: "22px",
	});
	expect(metrics.code).toMatchObject({ size: "12px", line: "18px", features: '"calt" 0' });
	expect(metrics.detail).toMatchObject({ size: "11px", line: "16px" });
	expect(metrics.title.weight).toBe("600");
	expect(metrics.bold.weight).toBe("500");
	expect(metrics.italic.style).toBe("italic");
	expect(metrics.menu).toMatchObject({ size: "13px", line: "20px" });
	expect(metrics.fonts).toEqual(
		expect.arrayContaining([
			{ family: "Instrument Sans Variable", style: "normal" },
			{ family: "Instrument Sans Variable", style: "italic" },
			{ family: "Fragment Mono", style: "normal" },
		]),
	);

	for (const width of [200, 300, 420]) {
		await page.locator("#type-specimen").evaluate((element, value) => {
			element.style.width = `${value}px`;
		}, width);
		expect(
			await page.locator("#type-specimen").evaluate((element) => element.scrollWidth <= element.clientWidth),
			`${width}px panel`,
		).toBe(true);
	}

	for (const appearance of ["dark", "light"]) {
		await page.evaluate((look) => {
			document.documentElement.dataset.appearance = look;
		}, appearance);
		for (const surface of ["bg", "canvas", "surface", "raised"]) {
			const colors = await page.locator("#type-specimen").evaluate((element, name) => {
				element.style.backgroundColor = `var(--color-${name})`;
				return {
					text: getComputedStyle(element.querySelector("#type-detail")!).color,
					background: getComputedStyle(element).backgroundColor,
				};
			}, surface);
			const [a, b] = [luminance(colors.text), luminance(colors.background)].sort((x, y) => x - y);
			expect((b! + 0.05) / (a! + 0.05), `${appearance} supporting text on ${surface}`).toBeGreaterThanOrEqual(4.5);
		}
	}

	await page.goto(`${project.url}/play/${project.name}?frame=checkout--empty`, { waitUntil: "domcontentloaded" });
	const frame = page.frameLocator("#spool-player");
	await frame.getByText("Sample frame", { exact: true }).waitFor();
	expect(await frame.locator("main").evaluate((element) => getComputedStyle(element).fontFamily)).toBe("Georgia");
	await frame.getByRole("link", { name: "External link" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.waitFor();
	await page.evaluate(() => document.fonts.ready);
	expect(await dialog.evaluate((element) => getComputedStyle(element).fontFamily)).toContain(
		"Instrument Sans Variable",
	);
	expect(
		await page.evaluate(() =>
			[...document.fonts].some((font) => font.family === "Instrument Sans Variable" && font.status === "loaded"),
		),
	).toBe(true);
});
