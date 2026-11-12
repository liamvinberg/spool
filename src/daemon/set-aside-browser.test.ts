import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fetchLocalCopy, openProject } from "../open";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { testBrowser } from "../test-browser";
import {
	builtUi,
	chooseAgent,
	closeAfterTest,
	fixtureAgentExecutor,
	makeApp,
	makeTempDir,
	until,
	writeDesignFile,
	writeFrame,
} from "../test-helpers";
import { serveDaemon } from "./server";

/**
 * A clash as the editor whose save lost sees it: a quiet count after who's here, which opens a list of the clashes,
 * each with Use theirs, Use mine and Ask agent to fix. Ana's machine is an in-process daemon; Ben's is served, with a browser
 * on its canvas and a fixture agent that records what it was told.
 */

/** A path long enough that its line has to be cut short before the actions. */
const GO = "shared/ui/checkout/payment/confirm-and-pay-button-that-books-the-table-for-tonight.tsx";
const BUTTON = (label: string) => `export function Go() {\n\treturn <button type="button">${label}</button>;\n}\n`;
const FRAME = (title: string) =>
	`import { Go } from "${GO.replace(/\.tsx$/u, "")}";\n\nexport default function Page() {\n\treturn (\n\t\t<main>\n\t\t\t<h1>${title}</h1>\n\t\t\t<Go />\n\t\t</main>\n\t);\n}\n`;

async function team() {
	const cloud = fakeTeam();
	const ana = cloud.machine("ana");
	const ben = cloud.machine("ben");
	const anaState = join(makeTempDir(), ".spool");
	const benState = join(makeTempDir(), ".spool");
	const anaRepo = join(makeTempDir(), "checkout");
	mkdirSync(anaRepo);
	const { root: anaRoot } = await initTeamProject(anaRepo, anaState, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	const benRoot = join(realpathSync(makeTempDir()), "checkout");
	mkdirSync(benRoot);
	copyFileSync(join(anaRoot, "spool.json"), join(benRoot, "spool.json"));
	await fetchLocalCopy(benRoot, benState, { origin: TEAM_ORIGIN, request: ben.request, openSocket: ben.openSocket });
	openProject(benRoot, benState);
	chooseAgent(benState, { engine: "claude" });
	makeApp(anaState, { cloud: ana.cloud, teamNotice: () => {} });
	const agent = fixtureAgentExecutor();
	const daemon = await serveDaemon({
		spoolDir: benState,
		version: "0.0.0-test",
		host: "127.0.0.1",
		port: 0,
		uiDir: await builtUi(),
		agentExecutor: agent.executor,
		// an agent counts as installed whatever is on PATH, so the third action asks it rather than copying a prompt
		agentLook: () => true,
		cloud: ben.cloud,
		teamNotice: () => {},
	});
	closeAfterTest(daemon);
	const text = (root: string, path: string) =>
		existsSync(join(root, "design", path)) ? readFileSync(join(root, "design", path), "utf8") : undefined;
	/** Both build on what both have; Ana's reaches the team while Ben is away, then Ben comes back. */
	const collide = async (writes: { path: string; ana: string; ben: string }[]) => {
		const back = cloud.offline("ben");
		for (const write of writes) writeDesignFile(benRoot, write.path, write.ben);
		for (const write of writes) writeDesignFile(anaRoot, write.path, write.ana);
		await until(() => writes.every((write) => cloud.file("checkout", write.path) === write.ana));
		back();
		await until(() => writes.every((write) => text(benRoot, write.path) === write.ana), 15_000);
		await until(() => {
			const marks = join(benRoot, "design/.spool/set-aside/marks.json");
			return existsSync(marks) && writes.every((write) => readFileSync(marks, "utf8").includes(write.path));
		});
	};
	/** What the agent has been told, across every spawn: probes and turns alike. */
	const told = () => agent.spawned.flatMap((proc) => proc.inputs).join("\n");
	return { cloud, ana: anaRoot, ben: benRoot, url: daemon.url, collide, text, told };
}

it("counts a clash quietly, lists it whole, and each of its three actions works", { timeout: 180_000 }, async () => {
	const { ana, ben, url, collide, text, told } = await team();
	writeDesignFile(ana, GO, BUTTON("Go"));
	writeFrame(ana, "home", FRAME("Home"));
	writeDesignFile(ana, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 480, "h": 320 }\n');
	writeFrame(ana, "cart", FRAME("Cart"));
	writeDesignFile(ana, "frames/cart/frame.json", '{ "x": 600, "y": 0, "w": 480, "h": 320 }\n');
	await until(() => text(ben, "frames/cart/frame.json") !== undefined && text(ben, GO) !== undefined);

	// both changed the same line, so nothing merges
	await collide([{ path: GO, ana: BUTTON("Book"), ben: BUTTON("Reserve") }]);

	const page = await (await testBrowser()).newPage({ viewport: { width: 1600, height: 900 } });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${url}/p/checkout`);
	const count = page.locator("[data-set-aside-count]");
	await count.getByRole("button", { name: "1 set aside" }).waitFor({ timeout: 30_000 });
	await page.locator('[data-frame-label="home"]').waitFor();
	// nothing stands across the canvas
	expect(await page.locator("[data-notices] [data-set-aside]").count()).toBe(0);

	await count.getByRole("button", { name: "1 set aside" }).click();
	const clash = count.locator("[data-set-aside-list] [data-set-aside]");
	expect(await clash.count()).toBe(1);
	await clash.getByText(`You and ana both changed ${GO}`).waitFor();
	// the long line is cut short before the actions, never under them
	const line = await clash.getByText(`You and ana both changed ${GO}`).boundingBox();
	const theirs = await clash.getByRole("button", { name: "Use theirs" }).boundingBox();
	expect(line !== null && theirs !== null && line.x + line.width <= theirs.x).toBe(true);

	// nothing has reached the agent; one press is a new thread with both sides
	expect(told()).not.toContain("clashed");
	await clash.getByRole("button", { name: "Ask agent to fix" }).click();
	await expect.poll(told, { timeout: 30_000 }).toContain("My changes to these files in this team project clashed");
	expect(told()).toContain(`design/${GO}: ana's version is in the file now. Mine is in design/.spool/set-aside/`);

	// Use mine: an ordinary new save on top, which reaches Ana, and the count goes
	await clash.getByRole("button", { name: "Use mine" }).click();
	await until(() => text(ana, GO) === BUTTON("Reserve"), 10_000);
	await expect.poll(() => count.count()).toBe(0);
	expect(errors).toEqual([]);
});

it("lists many clashed files as one clash, and Use theirs lets them all go", { timeout: 180_000 }, async () => {
	const { ben, ana, url, collide, text } = await team();
	const names = ["a", "b", "c", "d"];
	for (const [at, name] of names.entries()) {
		writeFrame(ana, name, `export default () => <h1>${name}</h1>;\n`);
		writeDesignFile(ana, `frames/${name}/frame.json`, `{ "x": ${at * 600}, "y": 0, "w": 480, "h": 320 }\n`);
	}
	await until(() => names.every((name) => text(ben, `frames/${name}/frame.json`) !== undefined));

	await collide(
		names.map((name) => ({
			path: `frames/${name}/frame.tsx`,
			ana: `export default () => <h1>${name} by ana</h1>;\n`,
			ben: `export default () => <h1>${name} by ben</h1>;\n`,
		})),
	);

	const page = await (await testBrowser()).newPage({ viewport: { width: 1600, height: 900 } });
	await page.goto(`${url}/p/checkout`);
	const count = page.locator("[data-set-aside-count]");
	await count.getByRole("button", { name: "4 set aside" }).click({ timeout: 30_000 });
	const clash = count.locator("[data-set-aside-list] [data-set-aside]");
	await clash.getByText("You and ana both changed 4 frames").waitFor();
	expect(await clash.count()).toBe(1);
	await clash.getByRole("button", { name: "Use theirs" }).click();
	await expect.poll(() => count.count()).toBe(0);
	await until(() => !readFileSync(join(ben, "design/.spool/set-aside/marks.json"), "utf8").includes("frames/"));
	for (const name of names)
		expect(text(ben, `frames/${name}/frame.tsx`)).toBe(`export default () => <h1>${name} by ana</h1>;\n`);
	expect(text(ana, "frames/a/frame.tsx")).toBe("export default () => <h1>a by ana</h1>;\n");
});
