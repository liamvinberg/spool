import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProjectedFrame } from "../api";
import { FindPalette } from "./find-palette";

const frame = (name: string, page: string, born: number): ProjectedFrame => ({
	name,
	page,
	x: 0,
	y: 0,
	w: 320,
	h: 200,
	born,
});

describe("FindPalette", () => {
	it("opens on every frame, newest first, with the order named", () => {
		const markup = renderToStaticMarkup(
			createElement(FindPalette, {
				frames: [
					frame("spool-home", "app", Date.now() - 3 * 86_400_000),
					frame("agent-play--ask-drop", "agent", Date.now()),
				],
				onPick: () => {},
				onLand: () => {},
				onClose: () => {},
			}),
		);

		expect(markup).toContain("2 frames, newest first");
		expect(markup.indexOf("agent-play--ask-drop")).toBeLessThan(markup.indexOf("spool-home"));
		expect(markup).toContain("3d");
		expect(markup).toContain("type part of a name");
		expect(markup).toContain("↵ lands there");
		expect(markup).toContain("esc closes");
	});

	it("says so when nothing answers", () => {
		const markup = renderToStaticMarkup(
			createElement(FindPalette, { frames: [], onPick: () => {}, onLand: () => {}, onClose: () => {} }),
		);

		expect(markup).toContain("nothing answers to that");
		expect(markup).toContain("0 frames, newest first");
	});
});
