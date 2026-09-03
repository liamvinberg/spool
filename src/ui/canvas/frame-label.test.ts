import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FrameLabel } from "./frame-label";

describe("FrameLabel", () => {
	it("truncates within the frame's rendered width when zoomed out", () => {
		const markup = renderToStaticMarkup(
			createElement(FrameLabel, {
				name: "landing--thread-refined",
				frameWidth: 1200,
				k: 0.2,
				entered: false,
				selected: false,
				hovered: false,
			}),
		);

		expect(markup).toContain("width:240px");
		expect(markup).toContain("min-w-0 truncate");
	});
});
