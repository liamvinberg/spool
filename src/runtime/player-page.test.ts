import { afterEach, describe, expect, it, vi } from "vitest";
import { barLayout, DESK_BAR_WIDE_PX, deskWindow } from "./player-page";

describe("barLayout — what a bar this wide can carry (#275)", () => {
	it("carries everything on a window a desktop frame opened", () => {
		expect(barLayout(1200)).toEqual({ project: true, word: true });
	});

	it("drops the project prefix and the size's word on a phone frame's window", () => {
		expect(barLayout(390)).toEqual({ project: false, word: false });
	});

	it("chooses at 520 and not a pixel earlier", () => {
		expect(barLayout(DESK_BAR_WIDE_PX).project).toBe(true);
		expect(barLayout(DESK_BAR_WIDE_PX - 1).project).toBe(false);
	});
});

describe("deskWindow — which shell this document is in", () => {
	afterEach(() => vi.unstubAllGlobals());

	const bridge = (extra: Record<string, unknown> = {}) => ({
		restored: false,
		reset: () => {},
		...extra,
	});

	it("is nothing in a browser tab, which is what keeps the edge bar there", () => {
		vi.stubGlobal("window", {});
		expect(deskWindow()).toBe(null);
	});

	it("is nothing when the app is too old to expose the whole bar's controls", () => {
		vi.stubGlobal("window", { spoolPlayWindow: { restored: true } });
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

	it("takes the play marks only from an app that takes them", () => {
		vi.stubGlobal("window", { spoolPlayWindow: bridge() });
		expect(deskWindow()?.mark).toBe(undefined);
		const taken: unknown[] = [];
		const spoolPlayWindow = bridge({
			mark(this: unknown, name: string, at: number) {
				taken.push([this === spoolPlayWindow, name, at]);
			},
		});
		vi.stubGlobal("window", { spoolPlayWindow });
		deskWindow()?.mark?.("shell-painted", 12);
		expect(taken).toEqual([[true, "shell-painted", 12]]);
	});
});
