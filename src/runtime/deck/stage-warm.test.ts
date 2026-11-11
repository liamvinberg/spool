// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { warmSlide } from "./stage-warm";

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

it("names a picture whose decoder never finishes once it has waited long enough, and never as ready", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	Object.defineProperty(document, "fonts", { configurable: true, value: new Set() });
	vi.spyOn(HTMLImageElement.prototype, "decode").mockImplementation(function (this: HTMLImageElement) {
		return this.src.endsWith("/stuck.png") ? new Promise<void>(() => {}) : Promise.resolve();
	});
	const box = document.createElement("div");
	box.innerHTML = '<img alt="" src="/stuck.png"><img alt="" src="/fine.png">';
	let warmed: Awaited<ReturnType<typeof warmSlide>> | undefined;
	void warmSlide(box, null, "").then((done) => {
		warmed = done;
	});
	await vi.advanceTimersByTimeAsync(19_000);
	expect(warmed).toBeUndefined();
	await vi.advanceTimersByTimeAsync(1_000);
	expect(warmed?.failed).toEqual([`${location.origin}/stuck.png`]);
});
