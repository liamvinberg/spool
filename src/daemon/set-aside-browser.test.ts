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
 * A set-aside mark as the editor whose save lost sees it: on the canvas, on each frame that renders the file, with
 * Compare, Put mine back and Hand to agent. Ana's machine is an in-process daemon; Ben's is served, with a browser
 * on its canvas and a fixture agent that records what it was told.
 */

const BUTTON = (label: string) => `export function Go() {\n\treturn <button type="button">${label}</button>;\n}\n`;
const FRAME = (title: string) =>
	`import { Go } from "shared/ui/go";\n\nexport default function Page() {\n\treturn (\n\t\t<main>\n\t\t\t<h1>${title}</h1>\n\t\t\t<Go />\n\t\t</main>\n\t);\n}\n`;

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

it("marks every frame that renders a set-aside file, and each of its three actions works", {
	timeout: 180_000,
}, async () => {
	const { ana, ben, url, collide, text, told } = await team();
	writeDesignFile(ana, "shared/ui/go.tsx", BUTTON("Go"));
	writeFrame(ana, "home", FRAME("Home"));
	writeDesignFile(ana, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 480, "h": 320 }\n');
	writeFrame(ana, "cart", FRAME("Cart"));
	writeDesignFile(ana, "frames/cart/frame.json", '{ "x": 600, "y": 0, "w": 480, "h": 320 }\n');
	writeFrame(ana, "about", "export default function About() {\n\treturn <h1>About</h1>;\n}\n");
	writeDesignFile(ana, "frames/about/frame.json", '{ "x": 1200, "y": 0, "w": 480, "h": 320 }\n');
	await until(() => text(ben, "frames/about/frame.json") !== undefined && text(ben, "shared/ui/go.tsx") !== undefined);

	await collide([{ path: "shared/ui/go.tsx", ana: BUTTON("Book"), ben: BUTTON("Reserve") }]);

	const page = await (await testBrowser()).newPage({ viewport: { width: 1600, height: 900 } });
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.goto(`${url}/p/checkout`);
	const mark = (frame: string) => page.locator(`[data-frame-label="${frame}"] [data-set-aside-mark]`);
	// both frames that mount the button wear the mark; the one that doesn't, doesn't
	await mark("home").waitFor({ timeout: 30_000 });
	await mark("cart").waitFor();
	expect(await mark("about").count()).toBe(0);
	expect(await page.locator("[data-set-aside-summary]").count()).toBe(0);

	await mark("home").click();
	const note = page.getByRole("dialog", { name: "Set aside" });
	await note.getByText("Your change was set aside. ana@devosurf.com's arrived first.").waitFor();
	await note.getByText("shared/ui/go.tsx").waitFor();

	// Compare: both sides, side by side
	await note.getByRole("button", { name: "Compare" }).click();
	const compare = page.getByRole("dialog", { name: /Compare/u });
	await expect
		.poll(() => compare.getByRole("region", { name: "Yours, set aside" }).textContent())
		.toContain("Reserve");
	expect(await compare.getByRole("region", { name: "The team's, from ana@devosurf.com" }).textContent()).toContain(
		"Book",
	);
	await compare.getByRole("button", { name: "Close" }).click();
	expect(await compare.count()).toBe(0);

	// nothing has reached the agent; one press of Hand to agent is a turn with both sides
	expect(told()).not.toContain("set aside");
	await note.getByRole("button", { name: "Hand to agent" }).click();
	await expect.poll(told, { timeout: 30_000 }).toContain("My change to design/shared/ui/go.tsx was set aside");
	expect(told()).toMatch(/My version is in design\/\.spool\/set-aside\/[0-9a-f-]+\/go\.tsx/u);
	expect(told()).toContain("ana@devosurf.com's save reached the team first");
	expect(await note.count()).toBe(0);

	// Put mine back: an ordinary new save on top, which reaches Ana, and the mark goes from both frames
	await mark("cart").click();
	await page.getByRole("dialog", { name: "Set aside" }).getByRole("button", { name: "Put mine back" }).click();
	await until(() => text(ana, "shared/ui/go.tsx") === BUTTON("Reserve"), 10_000);
	await expect.poll(() => mark("home").count()).toBe(0);
	expect(await mark("cart").count()).toBe(0);
	expect(errors).toEqual([]);
});

it("shows one summary when many saves are set aside at once, and lets a mark go", { timeout: 180_000 }, async () => {
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
	const summary = page.getByRole("region", { name: "Set aside" });
	await summary.getByText("4 of your changes were set aside: teammates' saves reached the team first.").waitFor({
		timeout: 30_000,
	});
	await page.locator('[data-frame-label="a"]').waitFor();
	expect(await page.locator("[data-set-aside-mark]").count()).toBe(0);
	for (const name of names) await summary.getByText(`frames/${name}/frame.tsx`).waitFor();

	await summary.getByRole("button", { name: "Dismiss frames/a/frame.tsx" }).click();
	await expect.poll(() => summary.locator("[data-set-aside]").count()).toBe(3);
	expect(text(ben, "frames/a/frame.tsx")).toBe("export default () => <h1>a by ana</h1>;\n");
	await summary.getByRole("button", { name: "Dismiss all" }).click();
	await expect.poll(() => summary.count()).toBe(0);
});
