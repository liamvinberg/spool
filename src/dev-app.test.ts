import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { electronInstalled, opensCheckoutApp } from "./dev-app";
import { makeTempDir } from "./test-helpers";

describe("checkout app verb", () => {
	it("is the app verb and nothing else", () => {
		expect(opensCheckoutApp(["app"])).toBe(true);
		expect(opensCheckoutApp(["serve", "--foreground"])).toBe(false);
		expect(opensCheckoutApp([])).toBe(false);
	});

	it("wants desktop/'s own electron install, not the root's", () => {
		const desktop = makeTempDir();
		expect(electronInstalled(desktop)).toBe(false);
		mkdirSync(join(desktop, "node_modules", ".bin"), { recursive: true });
		writeFileSync(join(desktop, "node_modules", ".bin", "electron"), "");
		expect(electronInstalled(desktop)).toBe(true);
	});
});
