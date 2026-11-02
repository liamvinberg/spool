import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import type { Download } from "playwright-core";
import { expect, it } from "vitest";
import { writeDesignFile, writeFrame } from "../test-helpers";
import { handCanvas } from "./hand-browser.test-helpers";

/** A solid #ffcc00 pixel. */
const AMBER_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4f4bhPwAHZALLB0SopwAAAABJRU5ErkJggg==";

/**
 * A frame showing an imported image (#216), which it also draws into a canvas
 * and reads back: the image arrives by URL from another origin than the
 * sandboxed frame's, so both are the runtime's doing, never the author's.
 */
const IMAGE_FRAME = `import { useEffect, useState } from "react";
import swatch from "./swatch.png";
export default function Frame() {
	const [read, setRead] = useState("");
	useEffect(() => {
		const image = new Image();
		image.onload = () => {
			const canvas = document.createElement("canvas");
			canvas.width = 1;
			canvas.height = 1;
			const context = canvas.getContext("2d");
			context.drawImage(image, 0, 0);
			try {
				setRead(Array.from(context.getImageData(0, 0, 1, 1).data).join(","));
			} catch (error) {
				setRead(String(error));
			}
		};
		image.src = swatch;
	}, []);
	return <main style={{ width: "100%", height: "100%", position: "relative" }}>
		<img src={swatch} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
		<output style={{ position: "absolute", left: 0, top: 0, fontSize: 8 }}>{read}</output>
	</main>;
}`;

it("downloads PNGs and a PDF from the canvas export menu", { timeout: 120_000 }, async () => {
	const source = `export default function Frame() { return <main style={{width: "100%", height: "100%", background: "#f5391a"}}>Export me</main>; }`;
	const f = await handCanvas({}, source, { w: 420, h: 300 });
	mkdirSync(join(f.project.root, "design/frames/second"), { recursive: true });
	writeFileSync(join(f.project.root, "design/frames/second/swatch.png"), Buffer.from(AMBER_PNG, "base64"));
	writeFrame(f.project.root, "second", IMAGE_FRAME);
	writeDesignFile(f.project.root, "frames/second/frame.json", JSON.stringify({ x: 460, y: 0, w: 420, h: 300 }));
	const { page } = f;
	await expect.poll(() => page.locator('[data-frame-label="second"]').count()).toBe(1);
	await expect
		.poll(() => page.frameLocator('iframe[title="second"]').locator("output").textContent(), { timeout: 30_000 })
		.toBe("255,204,0,255");
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
	// the imported image is in its frame's PNG
	const second = await pngs[1]?.path();
	if (second === null || second === undefined) throw new Error("PNG download failed");
	const centre = await page.evaluate(async (base64) => {
		const image = new Image();
		image.src = `data:image/png;base64,${base64}`;
		await image.decode();
		const canvas = document.createElement("canvas");
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const context = canvas.getContext("2d");
		context?.drawImage(image, 0, 0);
		return Array.from(context?.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data ?? []);
	}, readFileSync(second).toString("base64"));
	expect(centre).toEqual([255, 204, 0, 255]);
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
