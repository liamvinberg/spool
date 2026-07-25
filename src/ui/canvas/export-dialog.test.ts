import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExportDialog } from "./export-dialog";

const frames = [
	{ name: "menu", thumbnail: { project: "demo", frame: "menu", nonce: 0 } },
	{ name: "cart", thumbnail: { project: "demo", frame: "cart", nonce: 0 } },
	{ name: "receipt", thumbnail: { project: "demo", frame: "receipt", nonce: 0 } },
];

describe("ExportDialog", () => {
	it("offers separate PNG images and one ordered PDF", () => {
		const markup = renderToStaticMarkup(
			createElement(ExportDialog, {
				frames,
				exporting: false,
				onCancel: () => {},
				onExport: () => {},
			}),
		);

		expect(markup).toContain("Export 3 frames");
		expect(markup).toContain("menu, cart, receipt");
		expect(markup).toContain("PNG images");
		expect(markup).toContain("3 separate image files");
		expect(markup).toContain("PDF document");
		expect(markup).toContain("One document with 3 pages");
		expect(markup).toContain('checked=""');
	});

	it("keeps capture errors inside the choice", () => {
		const markup = renderToStaticMarkup(
			createElement(ExportDialog, {
				error: "Couldn’t capture receipt. Try again.",
				frames,
				exporting: false,
				onCancel: () => {},
				onExport: () => {},
			}),
		);

		expect(markup).toContain("Couldn’t capture receipt. Try again.");
	});
});
