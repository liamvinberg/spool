import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { initTeamProject } from "../init";
import { fetchLocalCopy, openProject } from "../open";
import { teamProjects } from "../registry";
import { CLOSE_FORMAT, CLOSE_PROTOCOL, encodeFrame } from "../team-sync-protocol";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { makeApp, makeTempDir, sseReader, until, writeDesignFile, writeFrame } from "../test-helpers";
import { followLocalCopy, openWebSocket, openWebSocketWith, type SyncSocketEvents } from "./team-sync";
import { git, marks, read, repo, same, status, syncState, text, twoEditors, untold } from "./team-sync-editors";

/**
 * Team sync as an editor sees it: two machines, each its own state folder and repo, each a daemon, against
 * one fake spool.page. Every assertion is on disk, on git, on what reached the team, or on what a canvas
 * reads, never on the protocol's messages.
 */

describe("when a team project ends for a machine", () => {
	for (const [change, act] of [
		["is made a viewer", (cloud: ReturnType<typeof fakeTeam>) => cloud.role("ben", "viewer")],
		["is removed from the team", (cloud: ReturnType<typeof fakeTeam>) => cloud.role("ben", null)],
		["finds the project removed", (cloud: ReturnType<typeof fakeTeam>) => cloud.removeProject("checkout", "ana")],
	] as const)
		it(`stops syncing and leaves an ordinary local project when its editor ${change}`, async () => {
			const { cloud, said, ana, ben } = await twoEditors();
			writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
			await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
			const link = readFileSync(join(ben.root, "spool.json"), "utf8");

			act(cloud);
			await until(() =>
				said.ben.some(
					(message) =>
						message.endsWith("It's now a project on this Mac only.") ||
						message.endsWith("This is now a project on this Mac only."),
				),
			);
			expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe(".spool/\n");
			expect(readFileSync(join(ben.root, "spool.json"), "utf8")).toBe(link);
			// said where it lasts: on the project's canvas whenever it opens, and on its cover at Home
			expect(await syncState(ben.daemon)).toEqual({
				ended: "devosurf",
				goneLocal: null,
				paused: null,
				sending: null,
				held: [],
				offline: false,
				update: null,
			});
			const listed = (await (await ben.daemon.request("/api/projects")).json()) as {
				projects: { root: string; ended?: string }[];
			};
			expect(listed.projects.find((project) => project.root === ben.root)?.ended).toBe("devosurf");
			// git is left alone: design/ shows up to be committed if Ben wants it, and nothing was committed for him
			expect(status(ben.root)).toEqual(expect.arrayContaining(["?? design/frames/home/frame.tsx", "?? spool.json"]));
			expect(git(ben.root, "rev-list", "--all", "--count").trim()).toBe("0");

			// nothing travels either way any more, and every file stays
			writeFrame(ben.root, "mine", "export default () => <h1>Mine</h1>;\n");
			writeFrame(ana.root, "home", "export default () => <h1>Ana again</h1>;\n");
			await new Promise((wake) => setTimeout(wake, 300));
			expect(cloud.file("checkout", "frames/mine/frame.tsx")).toBeUndefined();
			expect(read(ben.root, "frames/home/frame.tsx").toString()).toContain("<h1>Home</h1>");
		});

	it("never ends because the machine signed in to another account, and syncs again once its own is back", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		const record = () => JSON.parse(readFileSync(join(ben.root, "design/.spool/sync.json"), "utf8"));
		// the copy knows whose it is: the account its connection signed in as
		await until(() => record().account === "ben");

		// Ben signs in on his Mac with a work account that isn't in devosurf
		ben.machine.signIn("ben-work");
		await until(() => said.ben.some((message) => message.includes("signed in as ben-work@devosurf.com")), 10_000);
		expect(said.ben.filter((message) => message.startsWith("No longer synced"))).toEqual([]);
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(record().ended).toBeUndefined();
		expect(await syncState(ben.daemon)).toMatchObject({ ended: null });

		// what the team does meanwhile waits for Ben's own account
		writeFrame(ana.root, "about", "export default () => <h1>About</h1>;\n");
		await until(() => cloud.file("checkout", "frames/about/frame.tsx") !== undefined);
		await new Promise((wake) => setTimeout(wake, 300));
		expect(existsSync(join(ben.root, "design/frames/about"))).toBe(false);

		ben.machine.signIn("ben");
		await until(() => same(ana.root, ben.root, "frames/about/frame.tsx"), 20_000);
	});

	it("says who removed the project from which team, and keeps who in the copy's record", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => null;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		cloud.removeProject("checkout", "Ana");
		const removed = "Ana removed checkout from Devosurf. It's now a project on this Mac only.";
		await until(() => said.ben.includes(removed));
		expect(said.ben.filter((message) => message.startsWith("No longer synced"))).toEqual([]);
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe(".spool/\n");
		expect(JSON.parse(readFileSync(join(ben.root, "design/.spool/sync.json"), "utf8"))).toMatchObject({
			ended: true,
			removedBy: "Ana",
		});
		expect(await syncState(ben.daemon)).toMatchObject({ ended: "devosurf" });
	});

	it("is told the project was removed, not that it is out of it, on reconnect after being offline", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => null;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		const back = cloud.offline("ben");
		cloud.removeProject("checkout", "Ana");
		await new Promise((wake) => setTimeout(wake, 300));
		back();
		await until(
			() => said.ben.includes("Ana removed checkout from Devosurf. It's now a project on this Mac only."),
			10_000,
		);
		expect(said.ben.filter((message) => message.startsWith("No longer synced"))).toEqual([]);
	});

	it("is found on reconnect when the change was made while the copy was offline", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => null;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		// the line drops first, so nothing reaches Ben's copy until it tries again and is refused
		cloud.disconnect("checkout");
		cloud.role("ben", null);
		await until(() => said.ben.includes("No longer synced with devosurf. This is now a project on this Mac only."));
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe(".spool/\n");
		// Ana's copy is still an editor's, and carries on
		writeFrame(ana.root, "about", "export default () => null;\n");
		await until(() => cloud.file("checkout", "frames/about/frame.tsx") !== undefined);
		expect(said.ana).toEqual([]);
	});

	it("ends the copy whatever branch is checked out, and a branch alone never ends it", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => null;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		// a pre-team branch has no spool.json: that by itself is no ending
		const link = readFileSync(join(ben.root, "spool.json"), "utf8");
		rmSync(join(ben.root, "spool.json"));
		await new Promise((wake) => setTimeout(wake, 300));
		expect(said.ben.filter((message) => message.startsWith("No longer synced"))).toEqual([]);

		cloud.role("ben", null);
		await until(() => said.ben.includes("No longer synced with devosurf. This is now a project on this Mac only."));
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe(".spool/\n");
		// back on a branch with spool.json, the copy stays ended
		writeFileSync(join(ben.root, "spool.json"), link);
		expect(JSON.parse(readFileSync(join(ben.root, "design/.spool/sync.json"), "utf8"))).toMatchObject({
			ended: true,
		});
	});

	it("is a project to get again once its editor is back, and getting it follows the copy again", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		cloud.role("ben", "viewer");
		await until(() => said.ben.includes("No longer synced with devosurf. This is now a project on this Mac only."));
		// the ended copy is no local copy: Home shows the project not here, and the folder as Ben's own
		expect(teamProjects(ben.state)).toEqual([]);
		const listed = (await (await ben.daemon.request("/api/projects")).json()) as {
			projects: { root: string; team?: unknown }[];
		};
		expect(listed.projects.find((project) => project.root === ben.root)?.team).toBeUndefined();

		cloud.role("ben", "editor");
		writeFrame(ana.root, "news", "export default () => <h1>News</h1>;\n");
		const got = await ben.daemon.controlRequest("/api/cloud/teams/devosurf/projects/checkout/get", {
			method: "POST",
			headers: { "content-type": "application/json", origin: "http://localhost:7766" },
			body: JSON.stringify({ where: "checkout", path: ben.root }),
		});
		expect(got.status, await got.clone().text()).toBe(200);
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(teamProjects(ben.state).map(({ copies }) => copies)).toEqual([[ben.root]]);
		await until(() => same(ana.root, ben.root, "frames/news/frame.tsx"), 10_000);
		writeFrame(ben.root, "back", "export default () => <h1>Back</h1>;\n");
		await until(() => cloud.file("checkout", "frames/back/frame.tsx") !== undefined, 10_000);
	}, 30_000);

	it("is not an ending when the machine is signed out: it waits for `spool login`", async () => {
		const { cloud, said, ben } = await twoEditors();
		cloud.revoke("ben");
		await until(() => said.ben.some((message) => message.includes("signed out; run `spool login`")));
		await new Promise((wake) => setTimeout(wake, 300));
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(said.ben.filter((message) => message.includes("signed out"))).toHaveLength(1);
	});
});

const GONE_LOCAL = "Devosurf has gone local. Your copy keeps working here and syncs again once the team pays.";

describe("when a team lapses", () => {
	it("stops the copy without ending it, says so once, and leaves the folder and git as they were", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		const link = readFileSync(join(ben.root, "spool.json"), "utf8");

		cloud.lapse();
		await until(() => said.ben.includes(GONE_LOCAL) && said.ana.includes(GONE_LOCAL));
		// still a local copy of the team project: out of git, linked, and never ended
		expect(readFileSync(join(ben.root, "design/.gitignore"), "utf8")).toBe("*\n");
		expect(readFileSync(join(ben.root, "spool.json"), "utf8")).toBe(link);
		expect(JSON.parse(readFileSync(join(ben.root, "design/.spool/sync.json"), "utf8")).ended).toBeUndefined();
		expect(teamProjects(ben.state).map(({ copies }) => copies)).toEqual([[ben.root]]);
		expect(git(ben.root, "rev-list", "--all", "--count").trim()).toBe("0");
		// said where it lasts: on the project's canvas whenever it opens, and on its cover at Home
		expect(await syncState(ben.daemon)).toEqual({
			ended: null,
			goneLocal: "Devosurf",
			paused: null,
			sending: null,
			held: [],
			offline: false,
			update: null,
		});
		const listed = (await (await ben.daemon.request("/api/projects")).json()) as {
			projects: { root: string; goneLocal?: string; team?: { team: string } }[];
		};
		const card = listed.projects.find((project) => project.root === ben.root);
		expect(card?.goneLocal).toBe("Devosurf");
		expect(card?.team?.team).toBe("devosurf");

		// stopped, not retrying: nobody asks again until the minute is up, and nothing Ben makes goes anywhere
		const asked = cloud.standingAsked();
		writeFrame(ben.root, "mine", "export default () => <h1>Mine</h1>;\n");
		await new Promise((wake) => setTimeout(wake, 2_500));
		expect(cloud.standingAsked()).toBe(asked);
		expect(cloud.file("checkout", "frames/mine/frame.tsx")).toBeUndefined();
		expect(read(ben.root, "frames/mine/frame.tsx").toString()).toContain("Mine");
		expect(said.ben.filter((message) => message === GONE_LOCAL)).toHaveLength(1);
	}, 20_000);

	it("says nothing of going local when the copy's record can't take it, so the canvas isn't told it syncs again", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		// Ben's daemon again, on a Mac whose disk refuses his copy's record once the copy has stopped: a folder where
		// it goes, put there while the daemon asks the team's name to say it
		await ben.daemon.close();
		const record = join(ben.root, "design/.spool/sync.json");
		let refuse = false;
		const fetch: typeof globalThis.fetch = async (input, init) => {
			const asked = new Request(input, init);
			if (refuse && new URL(asked.url).pathname === "/api/teams") {
				rmSync(record);
				mkdirSync(record);
			}
			return ben.machine.cloud.fetch(asked);
		};
		const told: string[] = [];
		const daemon = makeApp(ben.state, {
			cloud: { ...ben.machine.cloud, fetch },
			teamNotice: (message) => told.push(message),
		});
		writeFrame(ana.root, "about", "export default () => <h1>About</h1>;\n");
		await until(() => same(ana.root, ben.root, "frames/about/frame.tsx"));
		const controller = new AbortController();
		onTestFinished(() => controller.abort());
		const events = sseReader(await daemon.request("/api/events", { signal: controller.signal }));

		refuse = true;
		cloud.lapse();
		await until(() => said.ana.includes(GONE_LOCAL) && told.some((message) => message.includes("EISDIR")));
		expect(told).not.toContain(GONE_LOCAL);
		expect(await syncState(daemon)).toMatchObject({ ended: null, goneLocal: null });
		// no page hears of a sync change: a canvas would read the state again and say it syncs
		const heard: unknown[] = [];
		await expect(
			(async () => {
				for (;;) {
					const event = await events.next(1_500);
					if ((event.data as { kind?: string }).kind === "sync") heard.push(event.data);
				}
			})(),
		).rejects.toThrow("timed out");
		expect(heard).toEqual([]);
	}, 20_000);

	it("isn't said again after a restart, and the copy follows the team again once it pays, with what was made meanwhile", async () => {
		const { cloud, said, ana, ben } = await twoEditors({ goneLocalAskMs: 300 });
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		cloud.lapse();
		await until(() => said.ben.includes(GONE_LOCAL) && said.ana.includes(GONE_LOCAL));
		// both keep working while the team is local: Ana changes the home page, Ben makes a page of his own
		writeFrame(ana.root, "home", "export default () => <h1>Ana's home</h1>;\n");
		writeFrame(ben.root, "mine", "export default () => <h1>Mine</h1>;\n");

		// Ben's Mac restarts while the team is still local: standing is asked at start, and nothing is said again
		await ben.daemon.close();
		const again: string[] = [];
		const asked = cloud.standingAsked();
		const restarted = makeApp(ben.state, {
			cloud: ben.machine.cloud,
			teamNotice: (message) => again.push(message),
			goneLocalAskMs: 300,
		});
		await until(() => cloud.standingAsked() > asked);
		expect(await syncState(restarted)).toMatchObject({ ended: null, goneLocal: "Devosurf" });
		await new Promise((wake) => setTimeout(wake, 500));
		expect(again).toEqual([]);

		cloud.pay();
		// asked again on the minute: both copies follow the team again, and catch up as after any time offline
		await until(() => cloud.file("checkout", "frames/mine/frame.tsx") !== undefined, 10_000);
		await until(() => cloud.file("checkout", "frames/home/frame.tsx")?.includes("Ana's home") === true, 10_000);
		await until(() => same(ben.root, ana.root, "frames/mine/frame.tsx"), 10_000);
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"), 10_000);
		// Ben's copy never took the team back to the home page it had: the team kept Ana's newer one
		expect(read(ben.root, "frames/home/frame.tsx").toString()).toContain("Ana's home");
		expect(cloud.saves("checkout").filter((save) => save.outcome === "set_aside")).toEqual([]);
		expect(await syncState(restarted)).toEqual({
			ended: null,
			goneLocal: null,
			paused: null,
			sending: null,
			held: [],
			offline: false,
			update: null,
		});
		expect(JSON.parse(readFileSync(join(ben.root, "design/.spool/sync.json"), "utf8")).goneLocal).toBeUndefined();
		expect(again).toEqual([]);

		// and it goes on syncing as ever
		writeFrame(ben.root, "after", "export default () => <h1>After</h1>;\n");
		await until(() => same(ben.root, ana.root, "frames/after/frame.tsx"), 10_000);
	}, 40_000);

	it("asks again sooner than the minute when spool.page couldn't be reached as the daemon started", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		cloud.lapse();
		await until(() => said.ben.includes(GONE_LOCAL));
		writeFrame(ben.root, "mine", "export default () => <h1>Mine</h1>;\n");

		// Ben's Mac starts offline, and the team pays while it is: the next ask is a minute away
		await ben.daemon.close();
		const reachable = cloud.unreachable();
		makeApp(ben.state, { cloud: ben.machine.cloud, teamNotice: () => {}, goneLocalRetryMs: 100 });
		await new Promise((wake) => setTimeout(wake, 1_000));
		cloud.pay();
		reachable();
		await until(() => cloud.file("checkout", "frames/mine/frame.tsx") !== undefined, 8_000);
	}, 20_000);

	it("follows the team again as soon as Home reads it paid for, without waiting for the minute", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "export default () => <h1>Home</h1>;\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		cloud.lapse();
		await until(() => said.ben.includes(GONE_LOCAL));
		writeFrame(ben.root, "mine", "export default () => <h1>Mine</h1>;\n");

		cloud.pay();
		// an admin paid from this Mac: Home's team list says the team no longer lapsed
		const teams = (await (await ben.daemon.request("/api/cloud/teams")).json()) as {
			teams: { billing?: { state: string } }[];
		};
		expect(teams.teams[0]?.billing?.state).toBe("paying");
		await until(() => cloud.file("checkout", "frames/mine/frame.tsx") !== undefined, 5_000);
		expect(await syncState(ben.daemon)).toMatchObject({ goneLocal: null });
	}, 20_000);
});

describe("the sync socket", () => {
	it("drops what is said while spool.page has yet to answer the handshake, rather than taking the daemon down", async () => {
		// a handshake that never finishes, as one does on a network that dropped while the Mac slept
		const held: Socket[] = [];
		const server = createServer((connection) => held.push(connection));
		await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
		onTestFinished(() => {
			for (const connection of held) connection.destroy();
			server.close();
		});
		const { port } = server.address() as { port: number };
		const socket = openWebSocket(`ws://127.0.0.1:${port}/sync`, "token", {
			open: () => {},
			message: () => {},
			close: () => {},
		});
		await until(() => held.length === 1);
		expect(() => socket.send("ping")).not.toThrow();
		socket.close();
	});

	/**
	 * A WebSocket server that finishes every handshake, then says `pong` every `every` ms while `answering` holds, as
	 * spool.page answers a ping; one that stops answering is a line that died without a close.
	 */
	async function quietServer(every = 20) {
		const sockets: Socket[] = [];
		const state = { answering: true };
		const server = createServer((connection) => {
			sockets.push(connection);
			connection.once("data", (head) => {
				const key = /sec-websocket-key: *(\S+)/iu.exec(head.toString())?.[1] ?? "";
				const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
				connection.write(
					`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
				);
				const pong = setInterval(() => {
					if (state.answering) connection.write(Buffer.from([0x81, 4, ...Buffer.from("pong")]));
				}, every);
				connection.on("close", () => clearInterval(pong));
				connection.on("error", () => {});
			});
		});
		await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
		onTestFinished(() => {
			for (const connection of sockets) connection.destroy();
			server.close();
		});
		const { port } = server.address() as { port: number };
		return { url: `ws://127.0.0.1:${port}/sync`, state };
	}

	const quick = { pingMs: 40, silentMs: 120, handshakeMs: 300 };

	it("stays open while spool.page answers, and says it closed once the line goes silent", async () => {
		const { url, state } = await quietServer();
		const said: string[] = [];
		openWebSocketWith(quick)(url, "token", {
			open: () => said.push("open"),
			message: () => {},
			close: () => said.push("close"),
		});
		await until(() => said.includes("open"));
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(said).toEqual(["open"]);
		// the Mac slept, or the network changed: nothing comes back, and no close ever arrives
		state.answering = false;
		await until(() => said.includes("close"), 2_000);
		expect(said).toEqual(["open", "close"]);
	});

	it("leaves a frame that arrives after the copy stopped alone, even with its folder gone", async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const { root } = await initTeamProject(repo(), join(makeTempDir(), ".spool"), {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
		});
		let late: SyncSocketEvents | undefined;
		const copy = followLocalCopy({
			root,
			origin: TEAM_ORIGIN,
			vault: ana.cloud.vault,
			openSocket: (url, token, events) => {
				late = events;
				return ana.openSocket(url, token, events);
			},
		});
		await copy.idle();
		copy.close();
		const frame = (path: string) =>
			encodeFrame(
				{ type: "file", path, version: 99, deleted: false },
				new TextEncoder().encode("export default () => null;\n"),
			);
		const deliver = (path: string) => {
			const framed = frame(path);
			late?.message(typeof framed === "string" ? framed : framed.slice().buffer);
		};
		deliver("frames/late/frame.tsx");
		expect(existsSync(join(root, "design/frames/late"))).toBe(false);
		rmSync(join(root, "design"), { recursive: true });
		expect(() => deliver("frames/later/frame.tsx")).not.toThrow();
		expect(existsSync(join(root, "design"))).toBe(false);
	});

	it("gives up a handshake that never finishes, so the copy tries again", async () => {
		const held: Socket[] = [];
		const server = createServer((connection) => held.push(connection));
		await new Promise<void>((listening) => server.listen(0, "127.0.0.1", listening));
		onTestFinished(() => {
			for (const connection of held) connection.destroy();
			server.close();
		});
		const { port } = server.address() as { port: number };
		const said: string[] = [];
		openWebSocketWith(quick)(`ws://127.0.0.1:${port}/sync`, "token", {
			open: () => said.push("open"),
			message: () => {},
			close: () => said.push("close"),
		});
		await until(() => said.includes("close"), 2_000);
		expect(said).toEqual(["close"]);
	});
});

describe("a dropped copy", () => {
	/** A copy whose every connection the test opens and drops by hand, on the fake clock; when each one was tried. */
	async function droppable() {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const { root } = await initTeamProject(repo(), join(makeTempDir(), ".spool"), {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
		});
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
		vi.setSystemTime(0);
		onTestFinished(() => {
			vi.useRealTimers();
		});
		const tries: number[] = [];
		let live: SyncSocketEvents | undefined;
		const copy = followLocalCopy({
			root,
			origin: TEAM_ORIGIN,
			vault: { read: async () => "token" },
			notice: () => {},
			openSocket: (_url, _token, events) => {
				tries.push(Date.now());
				live = events;
				return { send: () => {}, close: () => {} };
			},
		});
		onTestFinished(() => copy.close());
		await vi.advanceTimersByTimeAsync(0);
		/** The connection opens, holds for `held` ms, and drops: how long the copy waits before it tries again. */
		const dropAfter = async (held: number) => {
			const count = tries.length;
			live?.open();
			const caughtUp = encodeFrame({ type: "caught-up", head: 0 });
			live?.message(typeof caughtUp === "string" ? caughtUp : caughtUp.slice().buffer);
			await vi.advanceTimersByTimeAsync(held);
			const dropped = Date.now();
			live?.close();
			while (tries.length === count) await vi.advanceTimersByTimeAsync(100);
			return (tries.at(-1) as number) - dropped;
		};
		return { dropAfter };
	}

	it("waits longer each time it is dropped within a minute of connecting, and about 1 s once it held a minute", async () => {
		const { dropAfter } = await droppable();
		const first = await dropAfter(1_000);
		expect(first).toBeGreaterThanOrEqual(1_000);
		expect(first).toBeLessThanOrEqual(2_100);
		const second = await dropAfter(30_000);
		expect(second).toBeGreaterThanOrEqual(2_000);
		const third = await dropAfter(59_000);
		expect(third).toBeGreaterThanOrEqual(4_000);
		await dropAfter(1_000);
		await dropAfter(1_000);
		const capped = await dropAfter(1_000);
		expect(capped).toBeLessThanOrEqual(30_100);
		const after = await dropAfter(60_000);
		expect(after).toBeGreaterThanOrEqual(1_000);
		expect(after).toBeLessThanOrEqual(2_100);
	});
});

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const sleep = (ms: number) => new Promise((wake) => setTimeout(wake, ms));

async function eventually(condition: () => Promise<boolean>, ms = 8_000): Promise<void> {
	const start = Date.now();
	while (!(await condition())) {
		if (Date.now() - start > ms) throw new Error("condition never held");
		await sleep(50);
	}
}

/** Ben's daemon stops, as a lid closing: what is done to his copy meanwhile is found when it starts again. */
async function restartBen(setup: Awaited<ReturnType<typeof twoEditors>>, meanwhile: () => void, options = {}) {
	await setup.ben.daemon.close();
	meanwhile();
	const said: string[] = [];
	const daemon = makeApp(setup.ben.state, {
		cloud: setup.ben.machine.cloud,
		teamNotice: (message) => said.push(message),
		...options,
	});
	return { daemon, said };
}

describe("the check on every connect (#204)", () => {
	it("writes a teammate's save the relay dropped on the next connect, saying nothing", async () => {
		const { cloud, said, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "first\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		cloud.dropNextRelay("ben");
		writeFrame(ana.root, "home", "missed\n");
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") === "missed\n");
		writeFrame(ana.root, "about", "about\n");
		await until(() => same(ana.root, ben.root, "frames/about/frame.tsx"));
		expect(text(ben.root, "frames/home/frame.tsx")).toBe("first\n");
		const heard = said.ben.length;

		cloud.disconnect("checkout");
		await until(() => text(ben.root, "frames/home/frame.tsx") === "missed\n", 10_000);
		expect(cloud.drifts("checkout")).toEqual([{ repaired: 1, cause: "missed", by: "ben" }]);
		expect(said.ben.slice(heard)).toEqual([]);
		expect(await marks(ben.daemon)).toEqual([]);
		// nothing went back up: the team's version is what it was
		expect(cloud.saves("checkout").filter((save) => save.by === "ben")).toEqual([]);
	});

	it("puts right a file changed behind the daemon's back that its record says is the team's", async () => {
		const setup = await twoEditors();
		const { cloud, ana, ben } = setup;
		writeFrame(ana.root, "home", "team\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		const record = join(ben.root, "design/.spool/sync.json");
		const restarted = await restartBen(setup, () => {
			writeFrame(ben.root, "home", "behind its back\n");
			const state = JSON.parse(readFileSync(record, "utf8"));
			state.files["frames/home/frame.tsx"].hash = sha("behind its back\n");
			writeFileSync(record, JSON.stringify(state));
		});
		await until(() => text(ben.root, "frames/home/frame.tsx") === "team\n", 10_000);
		expect(cloud.file("checkout", "frames/home/frame.tsx")).toBe("team\n");
		expect(cloud.drifts("checkout")).toEqual([{ repaired: 1, cause: "missed", by: "ben" }]);
		expect(await marks(restarted.daemon)).toEqual([]);
	});

	it("never overwrites a change not sent yet: it goes up under the collision rule", async () => {
		const setup = await twoEditors();
		const { cloud, ana, ben } = setup;
		writeFrame(ana.root, "home", "home\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		const restarted = await restartBen(setup, () => {
			// the team moves on while Ben's record keeps believing it hasn't, and Ben changes the file meanwhile
			cloud.corrupt("checkout", "frames/home/frame.tsx", "the team's\n");
			writeFrame(ben.root, "home", "ben's unsent\n");
		});
		await until(() => cloud.saves("checkout").some((save) => save.by === "ben"), 10_000);
		await until(() => text(ben.root, "frames/home/frame.tsx") === cloud.file("checkout", "frames/home/frame.tsx"));
		// Ben's change reached the team as a save, and lost under the collision rule with a mark, not in silence
		expect(cloud.saves("checkout").filter((save) => save.by === "ben")).toEqual([
			expect.objectContaining({ path: "frames/home/frame.tsx", outcome: "set_aside" }),
		]);
		await eventually(async () => (await marks(restarted.daemon)).length === 1);
	});

	it("costs a copy that matches one fingerprint, and no list", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "home\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		cloud.disconnect("checkout");
		writeFrame(ana.root, "about", "about\n");
		await until(() => same(ana.root, ben.root, "frames/about/frame.tsx"), 10_000);
		await new Promise((wake) => setTimeout(wake, 300));
		expect(cloud.lists("checkout")).toBe(0);
		expect(cloud.drifts("checkout")).toEqual([]);
	});

	it("syncs as before with an older spool.page that makes no checks", async () => {
		const cloud = fakeTeam();
		cloud.withoutChecks();
		const ana = cloud.machine("ana");
		const anaState = join(makeTempDir(), ".spool");
		const { root } = await initTeamProject(repo(), anaState, {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
		});
		const daemon = makeApp(anaState, { cloud: ana.cloud });
		writeFrame(root, "home", "home\n");
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") === "home\n");
		expect(await (await daemon.request("/api/p/checkout/match-team", { method: "POST" })).json()).toMatchObject({
			error: "offline",
		});
		expect(cloud.lists("checkout")).toBe(0);
	});

	it("matches a copy whose record was lost to the team, keeping each difference as a mark Put mine back restores", async () => {
		// with no record, a file gone from disk can't be told from one never had: it comes back, unmarked
		const setup = await twoEditors();
		const { cloud, ana, ben } = setup;
		writeFrame(ana.root, "home", "home\n");
		writeFrame(ana.root, "about", "about\n");
		await until(
			() => same(ana.root, ben.root, "frames/home/frame.tsx") && same(ana.root, ben.root, "frames/about/frame.tsx"),
		);
		const restarted = await restartBen(setup, () => {
			rmSync(join(ben.root, "design/.spool/sync.json"));
			writeFrame(ben.root, "home", "ben's home\n");
			writeFrame(ben.root, "mine", "mine\n");
			rmSync(join(ben.root, "design/frames/about"), { recursive: true });
		});
		await until(() => text(ben.root, "frames/home/frame.tsx") === "home\n", 10_000);
		await until(() => text(ben.root, "frames/about/frame.tsx") === "about\n");
		await until(() => text(ben.root, "frames/mine/frame.tsx") === undefined);
		const held = await marks(restarted.daemon);
		expect(held.map((mark) => [mark.path, mark.deleted]).sort()).toEqual([
			["frames/home/frame.tsx", false],
			["frames/mine/frame.tsx", false],
		]);
		// the team never heard of any of it
		expect(cloud.saves("checkout").filter((save) => save.by === "ben")).toEqual([]);
		expect(cloud.file("checkout", "frames/mine/frame.tsx")).toBeUndefined();
		expect(cloud.drifts("checkout")).toEqual([{ repaired: 2, cause: "lost_record", by: "ben" }]);

		for (const mark of held)
			expect(
				(await restarted.daemon.request(`/api/p/checkout/set-aside/${mark.id}/put-back`, { method: "POST" }))
					.status,
			).toBe(200);
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") === "ben's home\n", 10_000);
		await until(() => cloud.file("checkout", "frames/mine/frame.tsx") === "mine\n", 10_000);
		await until(() => text(ana.root, "frames/mine/frame.tsx") === "mine\n", 10_000);
		expect(cloud.file("checkout", "frames/about/frame.tsx")).toBe("about\n");
	}, 30_000);

	it("keeps the Get it rule for a copy this machine never synced", async () => {
		const setup = await twoEditors();
		const { cloud, ana, ben } = setup;
		writeFrame(ana.root, "home", "home\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		await restartBen(setup, () => {
			rmSync(join(ben.root, "design/.spool/sync.json"));
			rmSync(join(ben.state, "synced-copies.json"));
			writeFrame(ben.root, "mine", "mine\n");
		});
		await until(() => cloud.file("checkout", "frames/mine/frame.tsx") === "mine\n", 10_000);
		expect(cloud.drifts("checkout")).toEqual([]);
	});
});

describe("offline (#205)", () => {
	it("is said once the copy has had no connection for a while, and goes the moment it is caught up again", async () => {
		const { cloud, ana, ben } = await twoEditors({ offlineMs: 400 });
		writeFrame(ana.root, "home", "home\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		expect(await syncState(ben.daemon)).toMatchObject({ offline: false });
		const back = cloud.offline("ben");
		await new Promise((wake) => setTimeout(wake, 150));
		// a drop shorter than the wait says nothing
		expect(await syncState(ben.daemon)).toMatchObject({ offline: false });
		await sleep(600);
		expect(await syncState(ben.daemon)).toMatchObject({ offline: true });
		// offline, Match the team needs a connection, and changes nothing
		writeFrame(ben.root, "mine", "mine\n");
		const refused = await ben.daemon.request("/api/p/checkout/match-team", { method: "POST" });
		expect(refused.status).toBe(409);
		expect(await refused.json()).toEqual({
			error: "offline",
			message: "Match the team needs a connection to spool.page. Nothing was changed.",
		});
		expect(text(ben.root, "frames/mine/frame.tsx")).toBe("mine\n");
		expect(await marks(ben.daemon)).toEqual([]);

		back();
		await until(() => cloud.file("checkout", "frames/mine/frame.tsx") === "mine\n", 10_000);
		await sleep(200);
		expect(await syncState(ben.daemon)).toMatchObject({ offline: false });
	}, 20_000);
});

describe("a restore from a backup (spool#191)", () => {
	it("brings back every save made since the backup from the Macs that hold it, once, with no marks", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "one\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		const backup = cloud.backup("checkout");
		writeFrame(ana.root, "home", "two\n");
		writeFrame(ben.root, "about", "ben's\n");
		await until(() => cloud.file("checkout", "frames/about/frame.tsx") === "ben's\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		await until(() => existsSync(join(ana.root, "design/frames/about/frame.tsx")));
		const before = cloud.saves("checkout").length;
		const listed = cloud.lists("checkout");

		cloud.restoreBackup("checkout", backup);
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") === "two\n", 10_000);
		await until(() => cloud.file("checkout", "frames/about/frame.tsx") === "ben's\n", 10_000);
		await sleep(300);
		const since = cloud.saves("checkout").slice(before);
		// both Macs hold the newer home: it lands once, and the second holder's is no collision
		expect(since.filter((save) => save.outcome === "set_aside")).toEqual([]);
		expect(
			cloud
				.history("checkout")
				.filter((row) => row.path === "frames/home/frame.tsx")
				.map((row) => row.outcome),
		).toEqual(["applied", "applied"]);
		expect(text(ana.root, "frames/home/frame.tsx")).toBe("two\n");
		expect(text(ben.root, "frames/about/frame.tsx")).toBe("ben's\n");
		expect(await marks(ana.daemon)).toEqual([]);
		expect(await marks(ben.daemon)).toEqual([]);

		// each Mac settles once; then the epoch is kept: a save after builds on the restored copy, and no list is asked again
		await until(() => cloud.lists("checkout") >= listed + 2);
		const lists = cloud.lists("checkout");
		writeFrame(ben.root, "home", "three\n");
		await until(
			() =>
				same(ana.root, ben.root, "frames/home/frame.tsx") && text(ana.root, "frames/home/frame.tsx") === "three\n",
		);
		cloud.disconnect("checkout");
		await sleep(500);
		expect(cloud.lists("checkout")).toBe(lists);
	});

	it("gives a copy offline since before the backup the restored version, and it sends nothing old", async () => {
		const setup = await twoEditors();
		const { cloud, ana, ben } = setup;
		writeFrame(ana.root, "home", "one\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		await ben.daemon.close();
		writeFrame(ana.root, "home", "two\n");
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") === "two\n");
		const backup = cloud.backup("checkout");
		writeFrame(ana.root, "home", "three\n");
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") === "three\n");
		await ana.daemon.close();
		cloud.restoreBackup("checkout", backup);

		const restarted = await restartBen(setup, () => {});
		await until(() => text(ben.root, "frames/home/frame.tsx") === "two\n", 10_000);
		await sleep(500);
		expect(cloud.file("checkout", "frames/home/frame.tsx")).toBe("two\n");
		expect(cloud.saves("checkout").filter((save) => save.by === "ben")).toEqual([]);
		expect(await marks(restarted.daemon)).toEqual([]);
	});

	it("leaves a copy fetched after the restore as it is: it holds the restored copy already", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "one\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		cloud.restoreBackup("checkout", cloud.backup("checkout"));
		await until(() => text(ana.root, "frames/home/frame.tsx") === "one\n");
		const lists = cloud.lists("checkout");
		const cy = cloud.machine("cy");
		const cyState = join(makeTempDir(), ".spool");
		const cyRoot = realpathSync(repo());
		copyFileSync(join(ana.root, "spool.json"), join(cyRoot, "spool.json"));
		await fetchLocalCopy(cyRoot, cyState, { origin: TEAM_ORIGIN, request: cy.request, openSocket: cy.openSocket });
		openProject(cyRoot, cyState);
		const daemon = makeApp(cyState, { cloud: cy.cloud, teamNotice: () => {} });
		// the fetch kept the epoch it was welcomed with, so the daemon meets nothing new
		expect(JSON.parse(readFileSync(join(cyRoot, "design/.spool/sync.json"), "utf8")).epoch).toEqual(
			expect.any(String),
		);
		await until(() => text(cyRoot, "frames/home/frame.tsx") === "one\n");
		await sleep(500);
		const asked = cloud.lists("checkout") - lists;
		// ana and ben each settle once with the new epoch; cy, fetched whole, never
		expect(asked).toBeLessThanOrEqual(2);
		expect(cloud.saves("checkout").filter((save) => save.by === "cy")).toEqual([]);
		await daemon.close();
	});

	it("sends a change made here while away on the restored version, applied", async () => {
		const setup = await twoEditors();
		const { cloud, ana, ben } = setup;
		writeFrame(ana.root, "home", "one\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		const backup = cloud.backup("checkout");
		// Ben's record moves past the backup, so his change is built on a version the restored team never had
		writeFrame(ana.root, "home", "two\n");
		await until(() => same(ana.root, ben.root, "frames/home/frame.tsx"));
		await ana.daemon.close();
		cloud.restoreBackup("checkout", backup);
		const restarted = await restartBen(setup, () => {
			writeFrame(ben.root, "home", "ben's while away\n");
		});
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") === "ben's while away\n", 10_000);
		expect(cloud.saves("checkout").filter((save) => save.by === "ben")).toEqual([
			expect.objectContaining({ path: "frames/home/frame.tsx", outcome: "applied" }),
		]);
		expect(await marks(restarted.daemon)).toEqual([]);
	});
});

describe("Match the team (#205)", () => {
	it("makes every travelling path the team's, keeps each difference as a mark, and leaves what didn't travel", async () => {
		const { cloud, ana, ben } = await twoEditors();
		writeFrame(ana.root, "home", "home\n");
		writeFrame(ana.root, "about", "about\n");
		await until(
			() => same(ana.root, ben.root, "frames/home/frame.tsx") && same(ana.root, ben.root, "frames/about/frame.tsx"),
		);
		// Ben's saves wait on a limit, so what he changes stays on his Mac
		cloud.limit("unavailable", 2);
		writeFrame(ben.root, "home", "ben's home\n");
		await until(() => cloud.refused("checkout").length > 0);
		writeFrame(ben.root, "mine", "mine\n");
		rmSync(join(ben.root, "design/frames/about"), { recursive: true });
		writeDesignFile(ben.root, "shared/film.bin", "x".repeat(26_000_000));
		writeDesignFile(ben.root, "notes.txt", "notes\n");
		await new Promise((wake) => setTimeout(wake, 200));

		const answered = await ben.daemon.request("/api/p/checkout/match-team", { method: "POST" });
		expect(answered.status).toBe(200);
		expect(await answered.json()).toEqual({ marked: 3 });
		expect(text(ben.root, "frames/home/frame.tsx")).toBe("home\n");
		expect(text(ben.root, "frames/about/frame.tsx")).toBe("about\n");
		expect(text(ben.root, "frames/mine/frame.tsx")).toBeUndefined();
		// what doesn't travel is untouched
		expect(readFileSync(join(ben.root, "design/shared/film.bin")).byteLength).toBe(26_000_000);
		expect(text(ben.root, "notes.txt")).toBe("notes\n");
		const held = await marks(ben.daemon);
		expect(held.map((mark) => mark.path).sort()).toEqual([
			"frames/about/frame.tsx",
			"frames/home/frame.tsx",
			"frames/mine/frame.tsx",
		]);
		expect(held.every((mark) => mark.together === 3)).toBe(true);

		cloud.lift();
		await new Promise((wake) => setTimeout(wake, 2_500));
		// nothing of Ben's went up: matched, his copy has nothing to send
		expect(cloud.file("checkout", "frames/home/frame.tsx")).toBe("home\n");
		expect(cloud.file("checkout", "frames/mine/frame.tsx")).toBeUndefined();
		for (const mark of held)
			await ben.daemon.request(`/api/p/checkout/set-aside/${mark.id}/put-back`, { method: "POST" });
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") === "ben's home\n", 10_000);
		await until(() => cloud.file("checkout", "frames/mine/frame.tsx") === "mine\n", 10_000);
		await until(() => cloud.file("checkout", "frames/about/frame.tsx") === null, 10_000);
	}, 30_000);
});

describe("an older Spool (#206)", () => {
	const NPM = { how: "cli" as const, command: "npm install -g spool.page@latest" };
	const PAUSED =
		"Sync paused: Update Spool to keep syncing with Devosurf: run `npm install -g spool.page@latest`. Changes stay on this Mac until it is updated.";

	it("is paused with the update line, never offline, keeps its edits, and sends them under the collision rule once updated", async () => {
		const setup = await twoEditors({ updateAskMs: 100, updateHow: NPM, offlineMs: 200 });
		const { cloud, said, ana, ben } = setup;
		writeFrame(ana.root, "home", "first\n");
		await until(() => text(ben.root, "frames/home/frame.tsx") === "first\n");

		const asked = cloud.tooOldAsked();
		const updated = cloud.tooOld("ben", CLOSE_PROTOCOL);
		await until(() => said.ben.includes(PAUSED));
		// longer than the offline wait: a pause says what to do, never that it is offline
		await sleep(500);
		expect(await syncState(ben.daemon)).toEqual({
			ended: null,
			goneLocal: null,
			paused: null,
			sending: null,
			held: [],
			offline: false,
			update: { team: "Devosurf", ...NPM },
		});
		// its tab and cover say sync is paused
		const { projects } = (await (await ben.daemon.request("/api/projects")).json()) as {
			projects: { root: string; syncPaused?: string }[];
		};
		expect(projects.find((project) => project.root === ben.root)?.syncPaused).toBe(
			"Update Spool to keep syncing with Devosurf",
		);
		// an agent's next command says so, once
		expect(await untold(ben.daemon)).toEqual([
			"sync paused: Update Spool to keep syncing with Devosurf: run `npm install -g spool.page@latest`",
		]);
		expect(await untold(ben.daemon)).toEqual([]);
		// it asks again, less often each time
		await until(() => cloud.tooOldAsked() >= asked + 3, 5_000);

		// both change the home page: Ana's reaches the team, Ben's stays editable and waits on his Mac
		writeFrame(ana.root, "home", "ana's\n");
		writeFrame(ben.root, "home", "ben's\n");
		await until(() => cloud.file("checkout", "frames/home/frame.tsx") === "ana's\n");
		await sleep(300);
		expect(text(ben.root, "frames/home/frame.tsx")).toBe("ben's\n");
		expect(
			cloud.saves("checkout").filter((save) => save.by === "ben" && save.path === "frames/home/frame.tsx"),
		).toHaveLength(0);

		// Ben's Mac restarts on a newer Spool: what waited goes up, and loses to Ana's as any later save does
		const restarted = await restartBen(setup, updated, { updateAskMs: 100, updateHow: NPM });
		await until(() => text(ben.root, "frames/home/frame.tsx") === "ana's\n", 10_000);
		expect(cloud.saves("checkout").filter((save) => save.by === "ben" && save.outcome === "set_aside")).toMatchObject(
			[{ path: "frames/home/frame.tsx" }],
		);
		expect((await marks(restarted.daemon)).map((mark) => mark.path)).toEqual(["frames/home/frame.tsx"]);
		expect(await syncState(restarted.daemon)).toMatchObject({ update: null, offline: false });
		expect(restarted.said).not.toContain(PAUSED);
	}, 30_000);

	it("is paused when a teammate's newer Spool moves the team's format on, says the Mac app, and resumes when it can", async () => {
		const { cloud, said, ana, ben } = await twoEditors({ updateAskMs: 100, updateHow: { how: "app" } });
		const updated = cloud.tooOld("ben", CLOSE_FORMAT);
		await until(() =>
			said.ben.includes(
				"Sync paused: Update Spool to keep syncing with Devosurf: Check for Updates in the Spool app. Changes stay on this Mac until it is updated.",
			),
		);
		expect(await syncState(ben.daemon)).toMatchObject({ update: { team: "Devosurf", how: "app" }, offline: false });
		writeFrame(ben.root, "mine", "mine\n");
		await sleep(300);
		expect(cloud.file("checkout", "frames/mine/frame.tsx")).toBeUndefined();

		// the next ask finds a Spool new enough: sync resumes, and what waited goes up
		updated();
		await until(() => cloud.file("checkout", "frames/mine/frame.tsx") === "mine\n", 10_000);
		await until(() => said.ben.includes("Sync resumed."));
		expect(await syncState(ben.daemon)).toMatchObject({ update: null });
		await until(() => same(ben.root, ana.root, "frames/mine/frame.tsx"));
	}, 20_000);

	it("fetches nothing into a fresh clone, and says to update", async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const ben = cloud.machine("ben");
		const { root } = await initTeamProject(repo(), join(makeTempDir(), ".spool"), {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
		});
		const benRoot = realpathSync(repo());
		copyFileSync(join(root, "spool.json"), join(benRoot, "spool.json"));
		cloud.tooOld("ben", CLOSE_PROTOCOL);
		await expect(
			fetchLocalCopy(benRoot, join(makeTempDir(), ".spool"), {
				origin: TEAM_ORIGIN,
				request: ben.request,
				openSocket: ben.openSocket,
			}),
		).rejects.toThrow(/Update Spool to keep syncing with devosurf: /u);
	});
});

describe("a team's format moving forward (#206)", () => {
	/** canvas.json as format 1 left it, and a walk named by folder alone. */
	const OLD = {
		"canvas.json": `${JSON.stringify({ format: 1, history: false }, null, "\t")}\n`,
		"frames/home/frame.tsx": 'export default () => <a data-go="checkout">buy</a>;\n',
		"frames/shop/checkout/frame.tsx": "export default () => <p>checkout</p>;\n",
	};

	it("is migrated on a team copy only once it has caught up, its unsent changes too, and goes up as saves", async () => {
		const cloud = fakeTeam();
		const ana = cloud.machine("ana");
		const ben = cloud.machine("ben");
		const { root: anaRoot } = await initTeamProject(repo(), join(makeTempDir(), ".spool"), {
			team: "devosurf",
			origin: TEAM_ORIGIN,
			request: ana.request,
			openSocket: ana.openSocket,
		});
		cloud.formatWas("checkout", 1, OLD);
		const benState = join(makeTempDir(), ".spool");
		const benRoot = realpathSync(repo());
		copyFileSync(join(anaRoot, "spool.json"), join(benRoot, "spool.json"));
		await fetchLocalCopy(benRoot, benState, {
			origin: TEAM_ORIGIN,
			request: ben.request,
			openSocket: ben.openSocket,
		});
		openProject(benRoot, benState);
		expect(JSON.parse(text(benRoot, "canvas.json") ?? "{}")).toMatchObject({ format: 1 });

		// offline, Ben's daemon reads the project and he walks to checkout by its old name: nothing is migrated yet
		const back = cloud.offline("ben");
		writeFrame(benRoot, "mine", 'export default () => <a data-go="checkout">mine</a>;\n');
		const daemon = makeApp(benState, { cloud: ben.cloud, teamNotice: () => {} });
		expect((await daemon.request("/api/p/checkout/frames")).status).toBe(200);
		await sleep(300);
		expect(JSON.parse(text(benRoot, "canvas.json") ?? "{}")).toMatchObject({ format: 1 });
		expect(text(benRoot, "frames/home/frame.tsx")).toContain('data-go="checkout"');
		expect(cloud.file("checkout", "frames/mine/frame.tsx")).toBeUndefined();

		// caught up, it migrates, and the team's format rises with the migrated files
		back();
		await until(() => cloud.format("checkout") === 2, 10_000);
		await until(() => cloud.file("checkout", "frames/mine/frame.tsx")?.includes("shop/checkout") === true, 10_000);
		await until(() => cloud.file("checkout", "frames/home/frame.tsx")?.includes("shop/checkout") === true, 10_000);
		expect(JSON.parse(cloud.file("checkout", "canvas.json") ?? "{}")).toMatchObject({ format: 2 });
		// the team never received Ben's change in the old format
		expect(cloud.saves("checkout").filter((save) => save.path === "frames/mine/frame.tsx")).toHaveLength(1);
		expect(cloud.saves("checkout").filter((save) => save.outcome === "set_aside")).toEqual([]);
	}, 20_000);
});
