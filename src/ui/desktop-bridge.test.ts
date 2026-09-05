import { describe, expect, it } from "vitest";
import { desktopBridge, isAppUpdate } from "./desktop-bridge";

describe("desktopBridge", () => {
	const bridge = {
		version: "0.14.0",
		update: null,
		onUpdate: () => () => {},
		install: () => {},
		dismiss: () => {},
	};

	it("is absent in a tab, and absent for anything that is not the app's shape", () => {
		expect(desktopBridge(undefined)).toBeUndefined();
		expect(desktopBridge({})).toBeUndefined();
		expect(desktopBridge({ spoolApp: { version: "0.14.0" } })).toBeUndefined();
		expect(desktopBridge({ spoolApp: { ...bridge, update: { kind: "offer" } } })).toBeUndefined();
	});

	it("is the app's bridge when every field is what the app exposes", () => {
		expect(desktopBridge({ spoolApp: bridge })).toBe(bridge);
		expect(desktopBridge({ spoolApp: { ...bridge, update: { kind: "offer", version: "0.15.0" } } })).toBeDefined();
	});
});

describe("isAppUpdate", () => {
	it("accepts the update stages and nothing to say, and refuses the rest", () => {
		expect(isAppUpdate(null)).toBe(true);
		expect(isAppUpdate({ kind: "offer", version: "0.15.0" })).toBe(true);
		expect(isAppUpdate({ kind: "downloading", version: "0.15.0", percent: 40 })).toBe(true);
		expect(isAppUpdate({ kind: "restarting", version: "0.15.0" })).toBe(true);
		expect(isAppUpdate({ kind: "failed", version: "0.15.0", message: "no", retryable: true })).toBe(true);
		expect(isAppUpdate({ kind: "checking", version: "0.15.0" })).toBe(true);
		expect(isAppUpdate({ kind: "preparing", version: "0.15.0" })).toBe(true);
		for (const percent of [Number.NaN, Number.POSITIVE_INFINITY, -1, 101]) {
			expect(isAppUpdate({ kind: "downloading", version: "0.15.0", percent })).toBe(false);
		}
		expect(isAppUpdate({ kind: "downloading", version: "0.15.0" })).toBe(false);
		expect(isAppUpdate({ kind: "failed", version: "0.15.0" })).toBe(false);
		expect(isAppUpdate({ kind: "done", version: "0.15.0" })).toBe(false);
		expect(isAppUpdate("offer")).toBe(false);
	});
});
