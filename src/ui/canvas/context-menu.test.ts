import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContextMenu } from "./context-menu";

const callbacks = {
	tidyLabel: "Tidy page",
	onTidy: () => {},
	onOpenEditor: () => {},
	onPlay: () => {},
	onReload: () => {},
	onTrash: () => {},
};

describe("ContextMenu export action", () => {
	it("exports one frame directly as PNG", () => {
		const markup = renderToStaticMarkup(
			createElement(ContextMenu, {
				at: { x: 20, y: 30 },
				exportAction: { selectionCount: 1, onSelect: () => {} },
				...callbacks,
			}),
		);

		expect(markup).toContain("Export as PNG");
		expect(markup).not.toContain("Export 1 frame");
	});

	it("opens the format choice for a multi-selection", () => {
		const markup = renderToStaticMarkup(
			createElement(ContextMenu, {
				at: { x: 20, y: 30 },
				exportAction: { selectionCount: 3, onSelect: () => {} },
				...callbacks,
			}),
		);

		expect(markup).toContain("Export 3 frames…");
		expect(markup).not.toContain("Export as PNG");
	});
});
