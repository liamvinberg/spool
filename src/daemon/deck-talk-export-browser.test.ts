import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import type { Download } from "playwright-core";
import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * A deck's talk exported from the canvas (spool#275): as a PDF from the export menu, one page per slide in the talk's
 * order, each at its last beat and its own size, and no loose frame; and from the deck page's row in Pages as the one
 * HTML file that plays it.
 */

const ground = (colour: string) => `export default function Slide() {
	return <main style={{ width: "100%", height: "100%", background: "${colour}" }} />;
}
`;

/** The colour at the middle of each page's picture. */
function middles(pdf: PDFDocument): number[][] {
	return pdf.getPages().map((page) => {
		const images = page.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
		const [entry] = images?.entries() ?? [];
		const image = entry === undefined ? undefined : pdf.context.lookup(entry[1]);
		if (!(image instanceof PDFRawStream)) throw new Error("a page with no picture");
		const w = image.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber();
		const h = image.dict.lookup(PDFName.of("Height"), PDFNumber).asNumber();
		const rgb = inflateSync(image.contents);
		const at = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 3;
		return [rgb[at] ?? 0, rgb[at + 1] ?? 0, rgb[at + 2] ?? 0];
	});
}

async function saved(download: Download): Promise<Buffer> {
	const path = await download.path();
	if (path === null) throw new Error("the download failed");
	return readFileSync(path);
}

it("exports the talk as a PDF from the export menu and as one HTML file from its row in Pages", {
	timeout: 240_000,
}, async () => {
	const browser = await testBrowser();
	const project = await serveProject({ uiDir: await builtUi(), experiments: { deck: true } });
	writeFrame(project.root, "pitch/opening", ground("#e63946"));
	writeFrame(
		project.root,
		"pitch/build",
		`import { ui } from "spool";
export default function Slide() {
	const beat = ui.beats(["one", "two", "three"]);
	const colour = { one: "#111111", two: "#222222", three: "#1d3557" }[beat.name];
	return <main style={{ width: "100%", height: "100%", background: colour }}>{beat.name}</main>;
}
`,
	);
	writeFrame(project.root, "pitch/phone", ground("#2a9d8f"));
	writeDesignFile(project.root, "frames/pitch/phone/frame.json", JSON.stringify({ x: 0, y: 0, w: 600, h: 800 }));
	writeFrame(project.root, "pitch/draft", ground("#ffd60a"));
	writeDesignFile(
		project.root,
		"frames/pitch/deck.json",
		JSON.stringify({ version: 1, w: 1280, h: 720, slides: ["opening", "build", "phone"] }),
	);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	await page.getByRole("button", { name: "pitch page" }).click();
	await page.locator("[data-deck-band]").waitFor({ timeout: 30_000 });

	// the export menu on a deck page: the talk, pdf or html, above the selection's own export
	await page.locator(`[data-frame-label="pitch/opening"]`).click({ button: "right" });
	await page.getByRole("menuitem", { name: /^Export…/ }).click();
	const talk = page.getByRole("radiogroup", { name: "Talk format" });
	await talk.getByText("pdf", { exact: true }).click();
	await expect
		.poll(() => page.getByRole("menuitem", { name: /^Export talk/ }).textContent())
		.toBe("Export talkpitch.pdf");
	const pdfDownload = page.waitForEvent("download", { timeout: 60_000 });
	await page.getByRole("menuitem", { name: /^Export talk/ }).click();
	const pdf = await PDFDocument.load(await saved(await pdfDownload));
	expect(pdf.getPages().map((one) => one.getSize())).toEqual([
		{ width: 960, height: 540 },
		{ width: 960, height: 540 },
		{ width: 450, height: 600 },
	]);
	// the talk's order, the build at its last beat, and the loose frame nowhere
	expect(middles(pdf)).toEqual([
		[230, 57, 70],
		[29, 53, 87],
		[42, 157, 143],
	]);
	await page.getByText("Downloaded", { exact: true }).waitFor();
	await page.keyboard.press("Escape");

	// the deck page's row in Pages: Export talk… opens the same choice in its place, and ↵ exports
	await page.getByRole("button", { name: "pitch page" }).click({ button: "right" });
	await page.getByRole("menuitem", { name: "Export talk…" }).click();
	await page.getByRole("radiogroup", { name: "Talk format" }).getByText("html", { exact: true }).click();
	const htmlDownload = page.waitForEvent("download", { timeout: 60_000 });
	await page.keyboard.press("Enter");
	const download = await htmlDownload;
	expect(download.suggestedFilename()).toBe("pitch.html");
	const html = (await saved(download)).toString("utf8");
	expect(html).toContain('<meta name="generator" content="Spool">');
	expect(html).not.toContain("#ffd60a");
	await page.getByText("Downloaded", { exact: true }).waitFor();
});
