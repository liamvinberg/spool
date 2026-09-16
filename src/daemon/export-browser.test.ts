import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import type { Download } from "playwright-core";
import { expect, it } from "vitest";
import { writeDesignFile, writeFrame } from "../test-helpers";
import { handCanvas } from "./hand-browser-helpers";

it("downloads PNGs and a PDF from the canvas export menu", { timeout: 120_000 }, async () => {
	const source = `export default function Frame() { return <main style={{width: "100%", height: "100%", background: "#f5391a"}}>Export me</main>; }`;
	const f = await handCanvas({}, source, { w: 420, h: 300 });
	writeFrame(f.project.root, "second", source);
	writeDesignFile(f.project.root, "frames/second/frame.json", JSON.stringify({ x: 460, y: 0, w: 420, h: 300 }));
	const { page } = f;
	await expect.poll(() => page.locator('[data-frame-label="second"]').count()).toBe(1);
	await page.locator('[data-frame-label="home"]').click();
	await page.locator('[data-frame-label="second"]').click({ modifiers: ["Shift"] });
	const openExport = async () => {
		await page.locator('[data-frame-label="home"]').click({ button: "right" });
		await page.getByRole("menuitem", { name: /^Export/ }).click();
		await page.getByRole("dialog").waitFor();
	};
	await openExport();
	const pngs: Download[] = [];
	page.on("download", (download) => pngs.push(download));
	await page.getByRole("button", { name: "Export", exact: true }).click();
	await expect.poll(() => pngs.length, { timeout: 30_000 }).toBe(2);
	for (const download of pngs) {
		const path = await download.path();
		if (path === null) throw new Error("PNG download failed");
		expect([...readFileSync(path).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
	}
	expect(pngs.map((download) => download.suggestedFilename())).toEqual(["home.png", "second.png"]);
	await openExport();
	await page.getByRole("dialog").getByText("PDF document", { exact: true }).click();
	const completed = page.waitForEvent("download");
	await page.getByRole("button", { name: "Export", exact: true }).click();
	const download = await completed;
	const path = await download.path();
	if (path === null) throw new Error("PDF download failed");
	const pdf = await PDFDocument.load(readFileSync(path));
	expect(pdf.getPageCount()).toBe(2);
	expect(pdf.getPage(0).getSize()).toEqual({ width: 315, height: 225 });
});
