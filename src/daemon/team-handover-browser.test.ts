import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { testBrowser } from "../test-browser";
import { builtUi, closeAfterTest, makeTempDir } from "../test-helpers";
import { handoverAddress } from "../ui/handover";
import { serveDaemon } from "./server";

/**
 * A team project's link at spool.page hands over to spool on this Mac when it answers: the browser lands on
 * Home with the project named, and Home opens this Mac's local copy of it.
 */
it("opens this Mac's local copy of the team project a link handed over, and Home otherwise", {
	timeout: 120_000,
}, async () => {
	const cloud = fakeTeam();
	const ana = cloud.machine("ana");
	const state = join(makeTempDir(), ".spool");
	const repo = join(makeTempDir(), "checkout");
	mkdirSync(repo);
	await initTeamProject(repo, state, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	const daemon = await serveDaemon({
		spoolDir: state,
		version: "0.0.0-test",
		host: "127.0.0.1",
		port: 0,
		uiDir: await builtUi(),
		teamSyncServices: { ...ana.services, notice: () => {} },
		cloudTeamsRequest: ana.request,
	});
	closeAfterTest(daemon);
	const page = await (await testBrowser()).newPage({ viewport: { width: 1280, height: 800 } });
	const local = (address: string) => `${daemon.url}${new URL(address).pathname}${new URL(address).search}`;

	await page.goto(local(handoverAddress({ team: "devosurf", project: "checkout" })));
	await expect.poll(() => new URL(page.url()).pathname, { timeout: 30_000 }).toBe("/p/checkout");
	expect(new URL(page.url()).search).toBe("");

	// a project of the team's that isn't on this Mac yet leaves Home where it is, asking for nothing
	await page.goto(local(handoverAddress({ team: "devosurf", project: "elsewhere" })));
	await expect.poll(() => page.url(), { timeout: 30_000 }).toBe(`${daemon.url}/`);
});
