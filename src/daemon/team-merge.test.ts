import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { baseOf, keepBase, mergeText, pruneBases } from "./team-merge";

const b = (text: string) => Buffer.from(text, "utf8");
const merged = (base: string, mine: string, team: string) => mergeText(b(base), b(mine), b(team))?.toString("utf8");

const BASE = [
	"export function Frame() {",
	"\treturn (",
	"\t\t<main>",
	"\t\t\t<h1>Settings</h1>",
	"\t\t\t<p>Members</p>",
	"\t\t\t<p>Laptops</p>",
	"\t\t\t<p>Activity</p>",
	"\t\t</main>",
	"\t);",
	"}",
	"",
].join("\n");

describe("mergeText", () => {
	it("keeps both changes where they changed different lines", () => {
		const mine = BASE.replace("<h1>Settings</h1>", "<h1>Your settings</h1>");
		const team = BASE.replace("<p>Activity</p>", "<p>Recent activity</p>");
		expect(merged(BASE, mine, team)).toBe(
			BASE.replace("<h1>Settings</h1>", "<h1>Your settings</h1>").replace(
				"<p>Activity</p>",
				"<p>Recent activity</p>",
			),
		);
	});

	it("keeps a line both added the same way once", () => {
		const both = BASE.replace("<p>Activity</p>", "<p>Activity</p>\n\t\t\t<p>Connector</p>");
		expect(merged(BASE, both, both)).toBe(both);
	});

	it("merges nothing where both changed the same line differently", () => {
		const mine = BASE.replace("<p>Members</p>", "<p>People</p>");
		const team = BASE.replace("<p>Members</p>", "<p>Team</p>");
		expect(merged(BASE, mine, team)).toBeUndefined();
	});

	it("merges nothing that isn't text", () => {
		expect(mergeText(Uint8Array.of(1, 0, 2), Uint8Array.of(1, 0, 3), Uint8Array.of(1, 0, 2))).toBeUndefined();
	});

	it("keeps line endings as they were", () => {
		const base = "a\r\nb\r\nc\r\n";
		expect(merged(base, "A\r\nb\r\nc\r\n", "a\r\nb\r\nC\r\n")).toBe("A\r\nb\r\nC\r\n");
	});

	it("keeps a file without a final newline as it was", () => {
		expect(merged("a\nb\nc", "A\nb\nc", "a\nb\nC")).toBe("A\nb\nC");
	});
});

describe("kept versions", () => {
	it("keeps, reads and prunes nothing once the design folder is gone, without throwing", () => {
		const design = join(makeTempDir(), "design");
		mkdirSync(design);
		keepBase(design, "a", b("one\n"));
		expect(baseOf(design, "a")?.toString("utf8")).toBe("one\n");
		rmSync(design, { recursive: true });
		expect(() => keepBase(design, "b", b("two\n"))).not.toThrow();
		expect(baseOf(design, "a")).toBeUndefined();
		expect(() => pruneBases(design, new Set())).not.toThrow();
		expect(existsSync(design)).toBe(false);
	});
});
