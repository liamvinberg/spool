import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fetchLocalCopy, openProject } from "../open";
import type { PresenceState } from "../team-sync-protocol";
import { fakeTeam, TEAM_COLORS, TEAM_ORIGIN } from "../team-sync-test-harness";
import { makeApp, makeTempDir, sseReader } from "../test-helpers";

/**
 * Presence as one editor's canvas hears another: the daemon carries where its person is to the team and
 * tells its canvas where everyone else is. Assertions are on what a canvas is told and on disk, never on the
 * messages between the daemon and the team.
 */

function git(cwd: string, ...args: string[]): string {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function repo(name = "checkout"): string {
	const root = join(makeTempDir(), name);
	mkdirSync(root);
	git(root, "init", "--quiet", "--initial-branch=main", ".");
	return realpathSync(root);
}

type Daemon = ReturnType<typeof makeApp>;

/** Ana starts the team project; Ben's clone fetches it; each machine's daemon follows its local copies. */
async function team() {
	const cloud = fakeTeam();
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
	const clone = async (state: string, machine: typeof ben, name = "checkout") => {
		const root = repo(name);
		copyFileSync(join(anaRoot, "spool.json"), join(root, "spool.json"));
		await fetchLocalCopy(root, state, {
			origin: TEAM_ORIGIN,
			request: machine.request,
			openSocket: machine.openSocket,
		});
		openProject(root, state);
		return root;
	};
	const benRoot = await clone(benState, ben);
	return {
		cloud,
		ana: { root: anaRoot, state: anaState, services: ana.services, clone: () => clone(anaState, ana, "second") },
		ben: { root: benRoot, state: benState, services: ben.services },
	};
}

const daemon = (machine: { state: string; services: ReturnType<ReturnType<typeof fakeTeam>["machine"]>["services"] }) =>
	makeApp(machine.state, { teamSyncServices: { ...machine.services, notice: () => {} } });

/** A canvas on a project: what its event stream says of presence, and its own person's moves. */
async function canvas(app: Daemon, project: string) {
	const sse = sseReader(await app.request(`/api/p/${project}/events`));
	const hello = await sse.next();
	return {
		hello,
		/** The next thing it is told about somebody. */
		async heard(): Promise<{ person: { accountId: string; name: string; color: string }; state: unknown }> {
			for (;;) {
				const event = await sse.next(8000);
				if (event.event === "presence") return event.data as never;
			}
		},
		quiet: () => sse.expectQuiet(300),
		say: (state: PresenceState | null) =>
			app.request(`/api/p/${project}/presence`, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ state }),
			}),
		close: () => sse.cancel(),
	};
}

const at = (x: number, y: number, more: Partial<PresenceState> = {}): PresenceState => ({
	page: "",
	pointer: { x, y },
	pressed: false,
	dragging: [],
	inside: null,
	view: { x: 0, y: 0, w: 1440, h: 900 },
	...more,
});

/** Every file under a folder, with its bytes: what a machine has on disk. */
function disk(root: string): Record<string, string> {
	const files: Record<string, string> = {};
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.name === ".git") continue;
			if (entry.isDirectory()) walk(full);
			else files[relative(root, full)] = readFileSync(full, "base64");
		}
	};
	walk(root);
	return files;
}

describe("presence on a team canvas", () => {
	it("shows one editor's pointer on the other's canvas as it moves, and says when they leave", async () => {
		const { ana, ben } = await team();
		const anas = await canvas(daemon(ana), "checkout");
		const bens = await canvas(daemon(ben), "checkout");
		expect(anas.hello.data).toMatchObject({ team: true });

		expect((await anas.say(at(120, 80))).status).toBe(204);
		expect(await bens.heard()).toMatchObject({
			person: { accountId: "ana", name: "ana", color: TEAM_COLORS[0] },
			state: at(120, 80),
		});
		await anas.say(at(300, 90, { pressed: true, dragging: ["home"] }));
		expect((await bens.heard()).state).toEqual(at(300, 90, { pressed: true, dragging: ["home"] }));
		// her own canvas is never told about her
		await anas.quiet();

		// the last canvas on her local copy closing is her leaving
		await anas.close();
		expect(await bens.heard()).toMatchObject({ person: { accountId: "ana" }, state: null });
	});

	it("tells a canvas that opens later who is already there", async () => {
		const { ana, ben } = await team();
		const anas = await canvas(daemon(ana), "checkout");
		const benDaemon = daemon(ben);
		const first = await canvas(benDaemon, "checkout");
		await anas.say(at(5, 6));
		await first.heard();
		const second = await canvas(benDaemon, "checkout");
		expect(await second.heard()).toMatchObject({ person: { accountId: "ana" }, state: at(5, 6) });
	});

	it("is one person however many local copies they have open on one machine", async () => {
		const { ana, ben } = await team();
		const second = await ana.clone();
		const anaDaemon = daemon(ana);
		const one = await canvas(anaDaemon, "checkout");
		const two = await canvas(anaDaemon, "second");
		const bens = await canvas(daemon(ben), "checkout");
		expect(second).not.toBe(ana.root);

		await one.say(at(1, 1));
		expect(await bens.heard()).toMatchObject({ person: { accountId: "ana" }, state: at(1, 1) });
		await two.say(at(2, 2));
		expect(await bens.heard()).toMatchObject({ person: { accountId: "ana" }, state: at(2, 2) });
		// leaving one of them, she is still here where the other has her
		await two.close();
		expect(await bens.heard()).toMatchObject({ person: { accountId: "ana" }, state: at(1, 1) });
		await one.close();
		expect(await bens.heard()).toMatchObject({ person: { accountId: "ana" }, state: null });
		// and neither of her copies was ever told about her other
		await one.quiet().catch(() => {});
	});

	it("writes nothing to disk, to git or to the team", async () => {
		const { cloud, ana, ben } = await team();
		const anas = await canvas(daemon(ana), "checkout");
		const bens = await canvas(daemon(ben), "checkout");
		await anas.say(at(0, 0));
		await bens.heard();
		const before = { ana: disk(ana.root), ben: disk(ben.root), saves: cloud.saves("checkout").length };

		for (let step = 1; step <= 12; step += 1)
			await anas.say(
				at(step * 10, step * 5, { inside: step > 6 ? "home" : null, dragging: step % 2 ? ["home"] : [] }),
			);
		await bens.say(at(40, 40));
		for (let step = 1; step <= 12; step += 1) await bens.heard();
		await anas.heard();
		await anas.close();
		await bens.heard();

		expect({ ana: disk(ana.root), ben: disk(ben.root), saves: cloud.saves("checkout").length }).toEqual(before);
		expect(git(ana.root, "status", "--porcelain", "--untracked-files=all")).toBe("?? spool.json\n");
		expect(git(ana.root, "log", "--oneline", "--all")).toBe("");
	});

	it("turns away a presence that isn't one", async () => {
		const { ana } = await team();
		const anas = await canvas(daemon(ana), "checkout");
		const refused = await anas.say({ page: "", pointer: "here" } as never);
		expect(refused.status).toBe(400);
	});
});
