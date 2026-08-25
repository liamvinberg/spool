import { describe, expect, it } from "vitest";
import type { FsHit, ProjectCard } from "./api";
import { browseRows, crumbsOf, groupRows, jumpTargets, shortPath } from "./picker-model";

const HOME = "/Users/liam";

const hit = (path: string, isProject = false): FsHit => ({
	name: path.slice(path.lastIndexOf("/") + 1),
	path,
	parent: path.slice(0, path.lastIndexOf("/")),
	isProject,
	matched: [],
});

const card = (root: string): ProjectCard => ({ name: "x", root, openedAt: "2026-08-01", frameCount: 0, covers: [] });

describe("groupRows", () => {
	it("splits a search into what spool can open and where you can go", () => {
		const rows = [hit(`${HOME}/personal/projects/gym-brute`, true), hit(`${HOME}/work/clients/gym-brute-api`)];
		expect(groupRows(rows, true)).toEqual([
			{ label: "spool projects", rows: [rows[0]], from: 0 },
			{ label: "folders", rows: [rows[1]], from: 1 },
		]);
	});

	it("drops the empty half rather than heading it", () => {
		const rows = [hit(`${HOME}/notes`)];
		expect(groupRows(rows, true).map((group) => group.label)).toEqual(["folders"]);
	});

	it("keeps a browse in one unheaded group: the breadcrumb already names it", () => {
		const rows = [hit(`${HOME}/notes`)];
		expect(groupRows(rows, false)).toEqual([{ label: "", rows, from: 0 }]);
		expect(groupRows([], false)).toEqual([]);
	});
});

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

describe("jumpTargets", () => {
	it("is home, then where the registry says projects live, most-populated first", () => {
		expect(
			jumpTargets(
				[
					card(`${HOME}/work/clients/inwall`),
					card(`${HOME}/personal/projects/spool`),
					card(`${HOME}/personal/projects/kaffe`),
					card("/opt/elsewhere/thing"),
				],
				HOME,
			),
		).toEqual([
			{ label: "~", path: HOME },
			{ label: "~/personal/projects", path: `${HOME}/personal/projects` },
			{ label: "~/work/clients", path: `${HOME}/work/clients` },
		]);
	});
});
