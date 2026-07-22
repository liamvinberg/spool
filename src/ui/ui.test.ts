import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

describe("app scroll boundary", () => {
	it("prevents horizontal overscroll from becoming browser history navigation", async () => {
		const window = new Window();
		const style = window.document.createElement("style");
		style.textContent = readFileSync(new URL("./ui.css", import.meta.url), "utf8");
		window.document.head.append(style);

		expect(window.getComputedStyle(window.document.documentElement).overscrollBehaviorX).toBe("none");
		await window.close();
	});
});
