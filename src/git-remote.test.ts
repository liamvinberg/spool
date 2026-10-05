import { expect, it } from "vitest";
import { cloneCommand, repoOf } from "./git-remote";

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
