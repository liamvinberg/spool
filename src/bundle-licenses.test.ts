import { describe, expect, it } from "vitest";
import { packageDirectory, renderLicenses } from "./bundle-licenses";

describe("bundled package licenses", () => {
	it("finds the package a module belongs to through pnpm's nested layout", () => {
		expect(packageDirectory("node_modules/.pnpm/hono@4.12.31/node_modules/hono/dist/index.js")).toBe(
			"node_modules/.pnpm/hono@4.12.31/node_modules/hono",
		);
		expect(
			packageDirectory(
				"/repo/node_modules/.pnpm/@hono+node-server@2.0.10_hono@4.12.31/node_modules/@hono/node-server/dist/index.js?commonjs-proxy",
			),
		).toBe("/repo/node_modules/.pnpm/@hono+node-server@2.0.10_hono@4.12.31/node_modules/@hono/node-server");
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
			{ name: "@hono/node-server", version: "2.0.10", license: "MIT", texts: [] },
			zod,
		]);
		expect(page.match(/## zod 4\.4\.3/g)).toHaveLength(1);
		expect(page.indexOf("## @hono/node-server 2.0.10")).toBeLessThan(page.indexOf("## zod 4.4.3"));
		expect(page).toContain("License: MIT.\n\n```\nMIT License\n\nCopyright (c) Colin McDonnell\n```");
		expect(page).toContain(
			"## @hono/node-server 2.0.10\n\nLicense: MIT.\n\nThe published package carries no license file",
		);
	});
});
