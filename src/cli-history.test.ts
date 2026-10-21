import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { spoolAsync } from "./cli-test-helpers";
import { CONTROL_HEADER } from "./daemon/security";
import { serveDaemon } from "./daemon/server";
import { initTeamProject } from "./init";
import { fetchLocalCopy, openProject } from "./open";
import { fakeTeam, TEAM_ORIGIN } from "./team-sync-test-harness";
import { makeTempDir } from "./test-helpers";

/**
 * `spool history` through the real CLI against the fake spool.page (spool#114): what an agent prints of a team
 * project's file, every save to it in the team history and the file as it stood at a moment. Assertions are on what
 * the verb prints, never on the requests in between.
 */

function repo(): string {
	const root = join(makeTempDir(), "checkout");
	mkdirSync(root);
	execFileSync("git", ["init", "--quiet", "--initial-branch=main", "."], { cwd: root });
	return realpathSync(root);
}

const RECEIPT = "frames/receipt/frame.tsx";
const receipt = (words: string) =>
	`export default function Receipt() {\n\treturn (\n\t\t<main>\n\t\t\t<h2>${words}</h2>\n\t\t</main>\n\t);\n}\n`;

/** 09:00 UTC on a day in October: the clock the team files saves at, which the test turns. */
const NINE = Date.UTC(2026, 9, 21, 9, 0, 0);
const MINUTE = 60_000;

/** Ana starts the team project with a receipt frame; Ben's clone fetches it. */
async function team() {
	const cloud = fakeTeam();
	let now = NINE;
	cloud.clock(() => now);
	const ana = cloud.machine("ana");
	const ben = cloud.machine("ben");
	const anaState = join(makeTempDir(), ".spool");
	const benState = join(makeTempDir(), ".spool");
	const { root: anaRoot } = await initTeamProject(repo(), anaState, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	const benRoot = repo();
	copyFileSync(join(anaRoot, "spool.json"), join(benRoot, "spool.json"));
	await fetchLocalCopy(benRoot, benState, { origin: TEAM_ORIGIN, request: ben.request, openSocket: ben.openSocket });
	openProject(benRoot, benState);
	return {
		cloud,
		/** Move the team's clock to minutes past nine. */
		at: (minutes: number) => {
			now = NINE + minutes * MINUTE;
		},
		ana: { root: anaRoot, state: anaState, cloud: ana.cloud },
		ben: { root: benRoot, state: benState, cloud: ben.cloud },
	};
}

type Machine = { root: string; state: string; cloud: ReturnType<ReturnType<typeof fakeTeam>["machine"]>["cloud"] };

/** The machine's daemon, really served, and its `spool` at a terminal in the project, on UTC. */
async function mac(machine: Machine) {
	const daemon = await serveDaemon({
		spoolDir: machine.state,
		version: "0.0.0-test",
		host: "127.0.0.1",
		port: 0,
		cloud: machine.cloud,
		teamNotice: () => {},
	});
	onTestFinished(() => daemon.close());
	const home = makeTempDir();
	return {
		async online(): Promise<void> {
			await until(async () => {
				const read = await fetch(`${daemon.url}/api/p/checkout/comments`, {
					headers: { [CONTROL_HEADER]: daemon.controlToken },
				});
				return ((await read.json()) as { online?: boolean }).online === true;
			});
		},
		write: (path: string, text: string) => {
			mkdirSync(dirname(join(machine.root, "design", path)), { recursive: true });
			writeFileSync(join(machine.root, "design", path), text);
		},
		spool: (...args: string[]) =>
			spoolAsync(["history", ...args], home, machine.root, { SPOOL_DIR: machine.state, TZ: "UTC" }),
	};
}

/** A port nothing listens on now. */
function freePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const { port } = server.address() as AddressInfo;
			server.close(() => resolve(port));
		});
	});
}

async function until(holds: () => boolean | Promise<boolean>, ms = 8000): Promise<void> {
	const start = Date.now();
	while (!(await holds())) {
		if (Date.now() - start > ms) throw new Error("it never held");
		await new Promise((wake) => setTimeout(wake, 25));
	}
}

describe("spool history", { timeout: 90_000 }, () => {
	it("lists every save to a file, newest first, and prints it as it stood at a time", async () => {
		const { cloud, at, ana, ben } = await team();
		const anas = await mac(ana);
		const bens = await mac(ben);
		const saved = (count: number) =>
			until(() => cloud.history("checkout").filter((row) => row.path === RECEIPT).length >= count);

		anas.write(RECEIPT, receipt("Thanks!"));
		await saved(1);
		at(12);
		await until(() => cloud.file("checkout", RECEIPT) !== undefined);
		await until(async () => (await bens.spool(RECEIPT, "--at", "2026-10-21 09:00")).stdout === receipt("Thanks!"));
		bens.write(RECEIPT, receipt("Paid"));
		await saved(2);

		const listed = await anas.spool(RECEIPT);
		expect(listed.stderr).toBe("");
		expect(listed.status).toBe(0);
		expect(listed.stdout).toBe(
			[
				"2 saves to frames/receipt/frame.tsx, newest first (the team history keeps 90 days):",
				"2026-10-21 09:12:00  ben on ben's Mac",
				"2026-10-21 09:00:00  ana on ana's Mac",
				"",
			].join("\n"),
		);
		// a copy-pasted line's time, and one between the two saves
		expect((await anas.spool(RECEIPT, "--at", "2026-10-21 09:12:00")).stdout).toBe(receipt("Paid"));
		expect((await anas.spool("design/frames/receipt/frame.tsx", "--at", "2026-10-21T09:11:59Z")).stdout).toBe(
			receipt("Thanks!"),
		);

		// before its first save, the history holds nothing of it: never invented
		const before = await anas.spool(RECEIPT, "--at", "2026-10-21 08:59");
		expect(before.status).not.toBe(0);
		expect(before.stdout).toBe("");
		expect(before.stderr).toContain(
			"frames/receipt/frame.tsx didn't exist at 2026-10-21 08:59:00: no save to it by then in the team history",
		);
	});

	it("marks the save the team set aside", async () => {
		const { cloud, at, ana, ben } = await team();
		const anas = await mac(ana);
		const bens = await mac(ben);
		anas.write(RECEIPT, receipt("Thanks!"));
		await until(() => cloud.file("checkout", RECEIPT) !== undefined);
		await bens.online();
		await until(async () => (await bens.spool(RECEIPT)).stdout.startsWith("1 save"));

		// both change the same line while Ben is away: Ana's reaches the team first
		const back = cloud.offline("ben");
		at(5);
		anas.write(RECEIPT, receipt("Paid"));
		await until(() => cloud.file("checkout", RECEIPT) === receipt("Paid"));
		bens.write(RECEIPT, receipt("Done"));
		await new Promise((wake) => setTimeout(wake, 200));
		at(7);
		back();
		await until(() => cloud.history("checkout").some((row) => row.outcome === "set_aside"));

		const listed = await anas.spool(RECEIPT);
		expect(listed.status).toBe(0);
		// a loaded machine's watcher may see Ben's write only once he is back, and save again on the team's version
		const lines = listed.stdout.split("\n");
		expect(lines).toContain("2026-10-21 09:07:00  ben on ben's Mac  set aside");
		expect(lines).toContain("2026-10-21 09:05:00  ana on ana's Mac");
	});

	it("says a project that isn't a team's has its history in git", async () => {
		const root = repo();
		const state = join(makeTempDir(), ".spool");
		const home = makeTempDir();
		// a lane of its own: the default port may be another daemon's
		const env = { SPOOL_DIR: state, SPOOL_PORT: String(await freePort()) };
		await spoolAsync(["init"], home, root, env);
		const read = await spoolAsync(["history", RECEIPT], home, root, env);
		expect(read.status).not.toBe(0);
		expect(read.stderr).toContain("this project isn't a team project: its history is git's");
		await spoolAsync(["stop"], home, root, env);
	});
});
