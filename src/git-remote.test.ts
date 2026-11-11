import { expect, it } from "vitest";
import { cloneCommand, repoOf, teamProjectNameAt } from "./git-remote";

it("reads the ssh and https remotes of one repo as the same repo, with no credential kept", () => {
	const remotes = [
		"git@github.com:Devosurf/app.git",
		"ssh://git@github.com/devosurf/app.git",
		"ssh://git@github.com:22/devosurf/app",
		"https://github.com/devosurf/app.git",
		"https://ana:ghp_secret@github.com/Devosurf/app/",
		"http://github.com/devosurf/app",
		"git://github.com/devosurf/app.git",
		"github.com/devosurf/app",
	];
	for (const remote of remotes) expect(repoOf(remote), remote).toBe("github.com/devosurf/app");
	expect(repoOf("git@gitlab.com:devosurf/web/app.git")).toBe("gitlab.com/devosurf/web/app");
	expect(repoOf("https://github.com/devosurf/other.git")).not.toBe(repoOf("https://github.com/devosurf/app.git"));
	expect(cloneCommand("github.com/devosurf/app")).toBe("git clone https://github.com/devosurf/app.git");
});

it("reads a remote on this machine as no shared repo", () => {
	for (const local of ["/Users/ana/app", "../app", "file:///srv/app.git", "C:/app", "", "https://github.com/"])
		expect(repoOf(local), local).toBeUndefined();
});

it("names a team project after its repo at a checkout's top, never after a worktree's folder (spool#295)", () => {
	const repo = "github.com/liamvinberg/learn-harness";
	const at = (root: string, checkout?: Parameters<typeof teamProjectNameAt>[1], flag?: string) =>
		teamProjectNameAt(root, checkout, flag);
	expect(at("/w/588-some-task", { top: "/w/588-some-task", repo, main: "/m/learn-harness" })).toEqual({
		name: "learn-harness",
		from: "repo",
	});
	// cleaned as spool.page cleans a name; a folder's goes as typed
	expect(at("/w/x", { top: "/w/x", repo: "github.com/devosurf/My_App.js" })).toEqual({
		name: "my-app-js",
		from: "repo",
	});
	expect(at("/w/588-some-task", { top: "/w/588-some-task", repo: undefined, main: "/m/Learn_Harness" })).toEqual({
		name: "learn-harness",
		from: "checkout",
	});
	expect(at("/m/Site_A", { top: "/m/Site_A", repo: undefined })).toEqual({ name: "Site_A", from: "folder" });
	expect(at("/m/sandbox/lab", { top: "/m/sandbox", repo: "github.com/devosurf/sandbox" })).toEqual({
		name: "lab",
		from: "folder",
	});
	expect(at("/tmp/site", undefined)).toEqual({ name: "site", from: "folder" });
	expect(at("/w/588-some-task", { top: "/w/588-some-task", repo }, " Other ")).toEqual({
		name: "Other",
		from: "flag",
	});
});
