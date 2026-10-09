import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fetchLocalCopy, openProject } from "../open";
import type { PresenceState } from "../team-sync-protocol";
import { fakeTeam, TEAM_COLORS, TEAM_ORIGIN } from "../team-sync-test-harness";
import { type FakeAgentProc, fixtureAgentExecutor, makeApp, makeTempDir, sseReader, until } from "../test-helpers";
import { listProjectFrames } from "./projection";

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
		ana: {
			root: anaRoot,
			state: anaState,
			cloud: ana.cloud,
			request: ana.request,
			clone: () => clone(anaState, ana, "second"),
		},
		ben: { root: benRoot, state: benState, cloud: ben.cloud, request: ben.request },
	};
}

type Machine = ReturnType<ReturnType<typeof fakeTeam>["machine"]>;

const daemon = (machine: { state: string; cloud: Machine["cloud"]; request: Machine["request"] }) =>
	makeApp(machine.state, {
		cloud: machine.cloud,
		teamNotice: () => {},
	});

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

	it("says on Home who is inside each of the team's projects, once each and never the one asking", async () => {
		const { ana, ben } = await team();
		const anaDaemon = daemon(ana);
		const benDaemon = daemon(ben);
		const here = async () =>
			(await (await benDaemon.request("/api/cloud/teams/devosurf/here")).json()) as {
				projects: { name: string; people: { name: string; color: string }[] }[];
			};
		const bens = await canvas(benDaemon, "checkout");
		await bens.say(at(0, 0));
		expect(await here()).toMatchObject({ projects: [{ name: "checkout", people: [] }] });

		const anas = await canvas(anaDaemon, "checkout");
		await anas.say(at(1, 1));
		await bens.heard();
		expect((await here()).projects[0]?.people).toEqual([{ name: "ana", color: TEAM_COLORS[0] }]);
		await anas.close();
		await bens.heard();
		expect((await here()).projects[0]?.people).toEqual([]);
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

describe("a teammate's agent on a team canvas (#378)", () => {
	const THREAD = "1f0e2d3c-4b5a-4697-8899-aabbccddeeff";

	/** Ana's daemon with an agent the test speaks for, and a turn started on the team project */
	async function anaTurn(ana: Awaited<ReturnType<typeof team>>["ana"]) {
		const agent = fixtureAgentExecutor();
		const app = makeApp(ana.state, { cloud: ana.cloud, teamNotice: () => {}, agentExecutor: agent.executor });
		const started = await app.request("/api/p/checkout/agent/turn", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				thread: THREAD,
				turn: "t1",
				said: [{ prompt: "three directions, one designer each" }],
			}),
		});
		expect(started.status).toBe(200);
		await until(() => agent.spawned.length === 1);
		const proc = agent.spawned[0] as FakeAgentProc;
		proc.emit(JSON.stringify({ type: "system", subtype: "init", session_id: THREAD, cwd: ana.root }));
		return {
			app,
			proc,
			designer(task: string, description: string) {
				proc.emit(
					JSON.stringify({
						type: "system",
						subtype: "task_started",
						task_id: task,
						task_type: "local_agent",
						subagent_type: "designer",
						description,
						tool_use_id: `toolu_${task}`,
						session_id: THREAD,
					}),
				);
			},
			end() {
				proc.emit(JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: THREAD }));
				proc.exit(0);
			},
		};
	}

	it("reaches a teammate's disk as a placeholder that says whose designer holds it", async () => {
		const { ana, ben } = await team();
		const bens = await canvas(daemon(ben), "checkout");
		const turn = await anaTurn(ana);
		// the account she is signed in as is asked as her turn starts; a designer starts a moment later
		await new Promise((resolve) => setTimeout(resolve, 100));
		turn.designer("t1", "Design calm home");

		await until(() => listProjectFrames(ben.root).placeholders.length === 1, 8000);
		expect(listProjectFrames(ben.root).placeholders).toMatchObject([
			{ name: "calm-home", title: "Design calm home", by: { accountId: "ana", name: "ana" } },
		]);
		turn.end();
		await until(() => listProjectFrames(ben.root).placeholders.length === 0, 8000);
		await bens.close();
	});
});
