import { describe, expect, it } from "vitest";
import { browseRows, crumbsOf, shortPath } from "./folder-paths";

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
	it("gives a browsed folder the same shape a search answers with, and its .spool files only when asked", () => {
		const listing = {
			path: `${HOME}/personal`,
			parent: HOME,
			isProject: false,
			dirs: [{ name: "projects", path: `${HOME}/personal/projects`, isProject: false }],
			spools: [{ name: "kaffe.spool", path: `${HOME}/personal/kaffe.spool` }],
		};
		const folder = {
			name: "projects",
			path: `${HOME}/personal/projects`,
			parent: `${HOME}/personal`,
			isProject: false,
			matched: [],
		};
		expect(browseRows(listing)).toEqual([folder]);
		expect(browseRows(listing, true)).toEqual([
			folder,
			{
				name: "kaffe.spool",
				path: `${HOME}/personal/kaffe.spool`,
				parent: `${HOME}/personal`,
				isProject: false,
				matched: [],
				file: true,
			},
		]);
	});
});
