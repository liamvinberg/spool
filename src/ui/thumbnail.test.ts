// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Thumbnail } from "./thumbnail";

const HASH = "a".repeat(32);

describe("Thumbnail", () => {
	it("draws one plain immutable image URL", () => {
		const host = document.createElement("div");
		const root = createRoot(host);
		act(() =>
			root.render(
				createElement(Thumbnail, {
					project: "demo project",
					frame: "home/card",
					cover: { hash: HASH },
					alt: "home",
				}),
			),
		);
		const image = host.querySelector("img");
		expect(image?.getAttribute("src")).toBe(`/covers/demo%20project/home%2Fcard/${HASH}`);
		expect(image?.hasAttribute("srcset")).toBe(false);
		expect(image?.hasAttribute("sizes")).toBe(false);
	});
});
