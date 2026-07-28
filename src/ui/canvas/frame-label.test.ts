import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { exitChordLabel } from "../../runtime/term-keys";
import { FrameLabel } from "./frame-label";

describe("FrameLabel", () => {
	it("names a held terminal as paused without losing its exit door", () => {
		const markup = renderToStaticMarkup(
			createElement(FrameLabel, {
				name: "checkout",
				frameWidth: 390,
				k: 1,
				entered: true,
				paused: true,
				selected: false,
				hovered: false,
				terminal: true,
			}),
		);

		expect(markup).toContain(`paused · ${exitChordLabel()} exits`);
		expect(markup).not.toContain(`live · ${exitChordLabel()} exits`);
	});

	it("truncates within the frame's rendered width when zoomed out", () => {
		const markup = renderToStaticMarkup(
			createElement(FrameLabel, {
				name: "landing--thread-refined",
				frameWidth: 1200,
				k: 0.2,
				entered: false,
				paused: true,
				selected: false,
				hovered: false,
			}),
		);

		expect(markup).toContain("width:240px");
		expect(markup).toContain("min-w-0 truncate");
	});
});
