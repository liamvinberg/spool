import { describe, expect, it } from "vitest";
import { browseRows, crumbsOf, shortPath } from "./picker-model";

const HOME = "/Users/liam";

describe("shortPath", () => {
	it("prints home as the one character everybody reads it as", () => {
		expect(shortPath(HOME, HOME)).toBe("~");
		expect(shortPath(`${HOME}/personal/projects`, HOME)).toBe("~/personal/projects");
		expect(shortPath("/etc", HOME)).toBe("/etc");
	});
});

describe("crumbsOf", () => {
	it("makes every segment a place to press", () => {
		expect(crumbsOf(`${HOME}/personal/projects`, HOME)).toEqual([
			{ label: "~", path: HOME },
			{ label: "personal", path: `${HOME}/personal` },
			{ label: "projects", path: `${HOME}/personal/projects` },
		]);
	});

	it("still reads above home, where the browse can always go", () => {
		expect(crumbsOf("/Users/someone-else", HOME)).toEqual([
			{ label: "/", path: "/" },
			{ label: "Users", path: "/Users" },
			{ label: "someone-else", path: "/Users/someone-else" },
		]);
	});
});

describe("browseRows", () => {
	it("gives a browsed folder the same shape a search answers with, lit by nothing", () => {
		expect(
			browseRows({
				path: `${HOME}/personal`,
				parent: HOME,
				dirs: [{ name: "projects", path: `${HOME}/personal/projects`, isProject: false }],
			}),
		).toEqual([
			{
				name: "projects",
				path: `${HOME}/personal/projects`,
				parent: `${HOME}/personal`,
				isProject: false,
				matched: [],
			},
		]);
	});
});
