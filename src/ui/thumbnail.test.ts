// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Thumbnail } from "./thumbnail";

const HASH = "a".repeat(32);

function render(props: Parameters<typeof Thumbnail>[0]): HTMLElement {
	const host = document.createElement("div");
	const root = createRoot(host);
	act(() => root.render(createElement(Thumbnail, props)));
	return host;
}

describe("Thumbnail", () => {
	it("offers the whole ladder, addressed by content hash", () => {
		const host = render({
			project: "demo project",
			frame: "home/card",
			cover: { hash: HASH, widths: [780, 390, 195] },
			alt: "home",
		});
		const img = host.querySelector("img");
		expect(img?.getAttribute("srcset")).toBe(
			`/covers/demo%20project/home%2Fcard/${HASH}/780 780w, ` +
				`/covers/demo%20project/home%2Fcard/${HASH}/390 390w, ` +
				`/covers/demo%20project/home%2Fcard/${HASH}/195 195w`,
		);
	});

	it("falls back to the top rung for a browser that ignores srcset", () => {
		const host = render({
			project: "demo",
			frame: "home",
			cover: { hash: HASH, widths: [780, 390, 195] },
			alt: "home",
		});
		expect(host.querySelector("img")?.getAttribute("src")).toBe(`/covers/demo/home/${HASH}/780`);
	});

	it("passes the camera's own rung through as sizes", () => {
		const host = render({
			project: "demo",
			frame: "home",
			cover: { hash: HASH, widths: [780, 390, 195] },
			sizes: "97.5px",
			alt: "home",
		});
		expect(host.querySelector("img")?.getAttribute("sizes")).toBe("97.5px");
	});

	it("leaves sizes off when the caller has no camera to report", () => {
		const host = render({
			project: "demo",
			frame: "home",
			cover: { hash: HASH, widths: [195] },
			alt: "home",
		});
		expect(host.querySelector("img")?.hasAttribute("sizes")).toBe(false);
	});

	it("takes a one-rung ladder as a normal cover — a heal writes exactly that", () => {
		const host = render({
			project: "demo",
			frame: "home",
			cover: { hash: HASH, widths: [195] },
			alt: "home",
		});
		expect(host.querySelector("img")?.getAttribute("srcset")).toBe(`/covers/demo/home/${HASH}/195 195w`);
	});

	it("renders nothing for a ladder with no rungs", () => {
		const host = render({ project: "demo", frame: "home", cover: { hash: HASH, widths: [] }, alt: "home" });
		expect(host.querySelector("img")).toBeNull();
	});
});
