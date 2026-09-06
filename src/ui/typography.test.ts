import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("typography foundations", () => {
	it("keeps the canvas's type definitions identical to the app", () => {
		expect(readFileSync(join(process.cwd(), "design/shared/typography.css"), "utf8")).toBe(
			readFileSync(join(__dirname, "typography.css"), "utf8"),
		);
	});

	it("keeps UI styles on named text roles", () => {
		const files = readdirSync(__dirname).filter((file) => file.endsWith(".css") && file !== "typography.css");
		for (const file of files) {
			const css = readFileSync(join(__dirname, file), "utf8");
			expect(css, file).not.toMatch(/font-size:\s*(?:[\d.]|clamp\()/);
			expect(css, file).not.toMatch(/font-family:\s*["']/);
		}
	});
});
