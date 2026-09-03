import { afterEach, describe, expect, it, vi } from "vitest";
import { barLayout, DESK_BAR_WIDE_PX, deskWindow } from "./player-page";

describe("barLayout — what a bar this wide can carry (#275)", () => {
	it("carries everything on a window a desktop frame opened", () => {
		expect(barLayout(1200)).toEqual({ project: true, size: true, canvasLabel: true });
	});

	it("drops the project prefix and the size on a phone frame's window", () => {
		expect(barLayout(390)).toEqual({ project: false, size: false, canvasLabel: false });
	});

	it("chooses at 520 and not a pixel earlier", () => {
		expect(barLayout(DESK_BAR_WIDE_PX).project).toBe(true);
		expect(barLayout(DESK_BAR_WIDE_PX - 1).project).toBe(false);
	});

	it("never drops the frame's name, however narrow the window is dragged", () => {
		// The name is not one of the answers this function gives, at any width:
		// a bar with no name on it is a window nobody can tell apart.
		for (const width of [240, 320, 390, 519, 520, 1440]) {
			expect(Object.values(barLayout(width))).not.toContain(undefined);
		}
	});
});

describe("deskWindow — which shell this document is in", () => {
	afterEach(() => vi.unstubAllGlobals());

	const bridge = (extra: Record<string, unknown> = {}) => ({
		restored: false,
		reset: () => {},
		canvas: () => {},
		close: () => {},
		...extra,
	});

	it("is nothing in a browser tab, which is what keeps the edge bar there", () => {
		vi.stubGlobal("window", {});
		expect(deskWindow()).toBe(null);
	});

	it("is nothing when the app is too old to expose the whole bar's controls", () => {
		vi.stubGlobal("window", { spoolPlayWindow: { restored: true, close: () => {} } });
		expect(deskWindow()).toBe(null);
	});

	it("refuses anything that is not an object", () => {
		for (const value of ["yes", 1, true, null, () => {}]) {
			vi.stubGlobal("window", { spoolPlayWindow: value });
			expect(deskWindow()).toBe(null);
		}
	});

	it("reads the restore flag, and reads it as false unless it is exactly true", () => {
		vi.stubGlobal("window", { spoolPlayWindow: bridge({ restored: true }) });
		expect(deskWindow()?.restored).toBe(true);
		vi.stubGlobal("window", { spoolPlayWindow: bridge({ restored: "yes" }) });
		expect(deskWindow()?.restored).toBe(false);
		vi.stubGlobal("window", { spoolPlayWindow: bridge() });
		expect(deskWindow()?.restored).toBe(false);
	});

	it("calls through to the window's owner", () => {
		const calls: string[] = [];
		vi.stubGlobal("window", {
			spoolPlayWindow: bridge({
				reset: () => calls.push("reset"),
				canvas: () => calls.push("canvas"),
				close: () => calls.push("close"),
			}),
		});
		const desk = deskWindow();
		desk?.reset();
		desk?.canvas();
		desk?.close();
		expect(calls).toEqual(["reset", "canvas", "close"]);
	});
});
