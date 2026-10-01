import { describe, expect, it } from "vitest";
import { packageDirectory, renderLicenses } from "./bundle-licenses";

describe("bundled package licenses", () => {
	it("finds the package a module belongs to through pnpm's nested layout", () => {
		expect(packageDirectory("node_modules/.pnpm/hono@4.12.31/node_modules/hono/dist/index.js")).toBe(
			"node_modules/.pnpm/hono@4.12.31/node_modules/hono",
		);
		expect(
			packageDirectory(
				"/repo/node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.1/node_modules/@earendil-works/pi-ai/dist/index.js?commonjs-proxy",
			),
		).toBe("/repo/node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.1/node_modules/@earendil-works/pi-ai");
		expect(packageDirectory("\0/repo/node_modules/pako/index.js")).toBe("/repo/node_modules/pako");
		expect(packageDirectory("src/daemon/app.ts")).toBeUndefined();
	});

	it("lists each version once, in name order, with its license or the absence of one", () => {
		const zod = {
			name: "zod",
			version: "4.4.3",
			license: "MIT",
			texts: ["MIT License\n\nCopyright (c) Colin McDonnell"],
		};
		const page = renderLicenses([
			zod,
			{ name: "@earendil-works/pi-ai", version: "0.85.1", license: "MIT", texts: [] },
			zod,
		]);
		expect(page.match(/## zod 4\.4\.3/g)).toHaveLength(1);
		expect(page.indexOf("## @earendil-works/pi-ai 0.85.1")).toBeLessThan(page.indexOf("## zod 4.4.3"));
		expect(page).toContain("License: MIT.\n\n```\nMIT License\n\nCopyright (c) Colin McDonnell\n```");
		expect(page).toContain(
			"## @earendil-works/pi-ai 0.85.1\n\nLicense: MIT.\n\nThe published package carries no license file",
		);
	});
});
