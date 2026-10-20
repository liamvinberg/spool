import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fetchLocalCopy, openProject } from "../open";
import type { Comment } from "../team-sync-protocol";
import { fakeTeam, TEAM_COLORS, TEAM_ORIGIN } from "../team-sync-test-harness";
import { makeApp, makeTempDir, sseReader } from "../test-helpers";
import { writeCover } from "./thumbs";

/** A PNG as the booth draws a frame's cover: what a comment keeps as its still. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

/**
 * Comments on a team canvas as one editor's Mac leaves them and another's sees them (ADR 0011): written through the
 * daemon, carried by the local copy's sync connection, and shown on every other canvas live. Assertions are on what
 * a canvas reads and is told, and on what the team holds, never on the messages between a daemon and the team.
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

/** Ana starts the team project with a receipt frame; Ben's clone fetches it. */
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
	const frame = join(anaRoot, "design", "frames", "receipt");
	mkdirSync(frame, { recursive: true });
	writeFileSync(
		join(frame, "frame.tsx"),
		"export default function Receipt() {\n\treturn (\n\t\t<main>\n\t\t\t<h2>Thanks!</h2>\n\t\t</main>\n\t);\n}\n",
	);
	const benRoot = repo();
	copyFileSync(join(anaRoot, "spool.json"), join(benRoot, "spool.json"));
	await fetchLocalCopy(benRoot, benState, { origin: TEAM_ORIGIN, request: ben.request, openSocket: ben.openSocket });
	openProject(benRoot, benState);
	return {
		cloud,
		ana: { root: anaRoot, state: anaState, cloud: ana.cloud },
		ben: { root: benRoot, state: benState, cloud: ben.cloud },
	};
}

/** The files under a folder whose bytes hold some words, by their path in it. */
function filesSaying(dir: string, words: string): string[] {
	const found: string[] = [];
	const walk = (at: string) => {
		for (const entry of readdirSync(at, { withFileTypes: true })) {
			const full = join(at, entry.name);
			if (entry.name === ".git") continue;
			if (entry.isDirectory()) walk(full);
			else if (readFileSync(full, "utf8").includes(words)) found.push(relative(dir, full));
		}
	};
	walk(dir);
	return found;
}

/** Wait for something a daemon answers to hold. */
async function eventually(holds: () => Promise<boolean>, ms = 8000): Promise<void> {
	const start = Date.now();
	while (!(await holds())) {
		if (Date.now() - start > ms) throw new Error("it never held");
		await new Promise((wake) => setTimeout(wake, 25));
	}
}

type Machine = { state: string; cloud: ReturnType<ReturnType<typeof fakeTeam>["machine"]>["cloud"] };

const daemon = (machine: Machine) => makeApp(machine.state, { cloud: machine.cloud, teamNotice: () => {} });

/** A canvas on the project: what it reads of comments, what it is told, and what it writes. */
async function canvas(app: ReturnType<typeof daemon>) {
	const sse = sseReader(await app.request("/api/p/checkout/events"));
	await sse.next();
	const read = async () =>
		(await (await app.request("/api/p/checkout/comments")).json()) as {
			online: boolean;
			heard: number | null;
			comments: Comment[];
			reads: Record<string, number>;
		};
	const call = (path: string, method: string, body?: unknown) =>
		app.request(`/api/p/checkout/comments/${path}`, {
			method,
			headers: { "content-type": "application/json" },
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	return {
		read,
		/** Once its copy is connected to the team, so what it writes reaches it. */
		online: () => eventually(async () => (await read()).online),
		/** Told its comments changed: it reads them again. */
		async told(): Promise<void> {
			for (;;) {
				const event = await sse.next(8000);
				if (event.event === "change" && (event.data as { kind?: string }).kind === "comments") return;
			}
		},
		write: (comment: Record<string, unknown>) =>
			app.request("/api/p/checkout/comments", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ page: "", frame: "receipt", at: { x: 120, y: 64 }, element: null, ...comment }),
			}),
		reply: (id: string, body: string, mentions?: string[]) =>
			app.request(`/api/p/checkout/comments/${id}/replies`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ body, mentions }),
			}),
		/** Resolve, reopen, read or mark unread a comment, edit or delete it or one of its replies. */
		call,
		close: () => sse.cancel(),
	};
}

describe("a comment on a team canvas", () => {
	it("is on the other editor's canvas the moment it is made, and so is the reply", async () => {
		const { cloud, ana, ben } = await team();
		const anas = await canvas(daemon(ana));
		const bens = await canvas(daemon(ben));
		await anas.online();
		await bens.online();
		// Ana's Mac has drawn the frame: the comment keeps that picture of it
		writeCover(ana.root, "receipt", PNG);

		const written = await anas.write({
			body: "Thanks! is loud for a receipt.",
			element: {
				selector: "main > h2",
				outerHtml: "<h2>Thanks!</h2>",
				source: "frames/receipt/frame.tsx:4:4",
				generated: false,
			},
		});
		expect(written.status).toBe(201);
		const { id } = (await written.json()) as { id: string };
		await bens.told();
		const [seen] = (await bens.read()).comments;
		expect(seen).toMatchObject({
			id,
			audience: "team",
			page: "",
			frame: "receipt",
			at: { x: 120, y: 64 },
			element: {
				name: "h2",
				path: "design/frames/receipt/frame.tsx",
				lines: [4, 4],
				selector: "main > h2",
				excerpt: "<h2>Thanks!</h2>",
			},
			revision: expect.stringMatching(/^[0-9a-f]{64}$/u),
			author: { accountId: "ana", name: "ana", color: TEAM_COLORS[0] },
			agent: false,
			body: "Thanks! is loud for a receipt.",
			replies: [],
		});
		// the author's own canvas shows it too, and the team holds it
		expect((await anas.read()).comments.map((comment) => comment.id)).toEqual([id]);
		expect(cloud.comments("checkout").map((comment) => comment.body)).toEqual(["Thanks! is loud for a receipt."]);
		expect(seen?.still).toBe(true);
		expect(Buffer.from(cloud.still("checkout", id) ?? [])).toEqual(PNG);

		expect((await bens.reply(id, "Or the order number.")).status).toBe(201);
		await anas.told();
		expect((await anas.read()).comments[0]?.replies).toMatchObject([
			{ author: { accountId: "ben", name: "ben", color: TEAM_COLORS[1] }, body: "Or the order number." },
		]);
	});

	it("takes a comment on the page's field, with no element, revision or still", async () => {
		const { ana } = await team();
		const anas = await canvas(daemon(ana));
		await anas.online();
		const written = await anas.write({ frame: null, at: { x: -300, y: 40 }, body: "Where does the flow start?" });
		expect(written.status).toBe(201);
		expect((await anas.read()).comments).toMatchObject([
			{ frame: null, element: null, revision: null, still: false, at: { x: -300, y: 40 } },
		]);
	});

	it("is never a save: no file changes on either Mac or at the team", async () => {
		const { cloud, ana, ben } = await team();
		const anas = await canvas(daemon(ana));
		const bens = await canvas(daemon(ben));
		await anas.online();
		await bens.online();
		// the frame Ana drew before is at the team, so every save there is to make has been made
		await eventually(async () => cloud.paths("checkout").includes("frames/receipt/frame.tsx"));
		const saves = cloud.saves("checkout").length;
		await anas.write({ body: "one" });
		await bens.told();
		expect(cloud.saves("checkout")).toHaveLength(saves);
		expect(cloud.paths("checkout")).not.toContain(expect.stringContaining("comment"));
	});

	it("refuses words that are empty or too long", async () => {
		const { cloud, ana } = await team();
		const anas = await canvas(daemon(ana));
		await anas.online();
		expect((await anas.write({ body: "  " })).status).toBe(400);
		expect((await anas.write({ body: "x".repeat(4_001) })).status).toBe(400);
		expect((await anas.reply("nothere1", "hello?")).status).toBe(404);
		expect(cloud.comments("checkout")).toEqual([]);
	});

	it("can't be written offline, and the comments already there still show, after a restart too", async () => {
		const { cloud, ana, ben } = await team();
		const anas = await canvas(daemon(ana));
		const benDaemon = daemon(ben);
		const bens = await canvas(benDaemon);
		await anas.online();
		await bens.online();
		await anas.write({ body: "Before the train." });
		await bens.told();

		// what it heard, and when, is this Mac's own: kept in its state, never anywhere in the project
		const heard = (await bens.read()).heard;
		expect(heard).toBeGreaterThan(0);
		expect(filesSaying(ben.root, "Before the train.")).toEqual([]);
		expect(filesSaying(ben.state, "Before the train.")).toHaveLength(1);

		const back = cloud.offline("ben");
		await eventually(async () => !(await bens.read()).online);
		const refused = await bens.write({ body: "In the tunnel." });
		expect(refused.status).toBe(409);
		expect(await refused.json()).toMatchObject({ error: "offline" });
		expect((await bens.reply(cloud.comments("checkout")[0]?.id ?? "", "me too")).status).toBe(409);
		expect((await bens.read()).comments.map((comment) => comment.body)).toEqual(["Before the train."]);
		expect(cloud.comments("checkout")).toHaveLength(1);

		// spool quits and starts again with no way to reach the team: the comments it knew are still there
		await bens.close();
		await benDaemon.close();
		const restarted = await canvas(daemon(ben));
		expect(await restarted.read()).toMatchObject({ online: false, heard, comments: [{ body: "Before the train." }] });

		// back online, what was missed meanwhile arrives
		await anas.write({ body: "While you were away." });
		back();
		await restarted.online();
		await eventually(async () => (await restarted.read()).comments.length === 2);
	});
});

describe("changing a comment on a team canvas", () => {
	/** Ana's comment with Ben's reply, both canvases online and told of both. */
	async function thread() {
		const made = await team();
		const anas = await canvas(daemon(made.ana));
		const bens = await canvas(daemon(made.ben));
		await anas.online();
		await bens.online();
		const { id } = (await (await anas.write({ body: "Thanks! is loud." })).json()) as { id: string };
		await bens.told();
		const { id: reply } = (await (await bens.reply(id, "Or the order number.")).json()) as { id: string };
		await anas.told();
		return { ...made, anas, bens, id, reply };
	}

	it("resolves and reopens on every canvas, answered with the comment as it now is", async () => {
		const { anas, bens, id } = await thread();
		const resolved = await bens.call(`${id}/resolve`, "POST");
		expect(resolved.status).toBe(200);
		expect(await resolved.json()).toMatchObject({ comment: { id, resolved: { by: { accountId: "ben" } } } });
		await anas.told();
		expect((await anas.read()).comments[0]?.resolved).toMatchObject({ by: { name: "ben" } });
		const reopened = await anas.call(`${id}/reopen`, "POST");
		expect(await reopened.json()).toMatchObject({ comment: { id, resolved: null } });
		await bens.told();
		expect((await bens.read()).comments[0]?.resolved).toBeNull();
		expect((await anas.call("nothere1/resolve", "POST")).status).toBe(404);
	});

	it("edits the author's own words only, and deletes a reply or the whole comment", async () => {
		const { cloud, anas, bens, id, reply } = await thread();
		const edited = await anas.call(id, "PATCH", { body: "Thanks! is too loud." });
		expect(await edited.json()).toMatchObject({
			comment: { body: "Thanks! is too loud.", edited: expect.any(Number) },
		});
		await bens.told();
		expect((await bens.read()).comments[0]?.body).toBe("Thanks! is too loud.");
		const theirs = await anas.call(`${id}/replies/${reply}`, "PATCH", { body: "mine now" });
		expect(theirs.status).toBe(403);
		expect(await theirs.json()).toMatchObject({ error: "not_author" });
		expect((await anas.call(id, "PATCH", { body: "" })).status).toBe(400);

		const gone = await bens.call(`${id}/replies/${reply}`, "DELETE");
		expect(await gone.json()).toMatchObject({ comment: { id, replies: [] } });
		// an editor deletes anyone's: Ben deletes Ana's comment, and it leaves every canvas
		const removed = await bens.call(id, "DELETE");
		expect(await removed.json()).toEqual({ removed: id });
		await anas.told();
		expect((await anas.read()).comments).toEqual([]);
		expect(cloud.comments("checkout")).toEqual([]);
	});

	it("reads and marks unread for its person only, kept across a restart", async () => {
		const { cloud, ana, anas, bens, id } = await thread();
		const read = await anas.call(`${id}/read`, "POST");
		const { read: at } = (await read.json()) as { read: number };
		expect(at).toBeGreaterThan(0);
		expect((await anas.read()).reads).toEqual({ [id]: at });
		expect((await bens.read()).reads).toEqual({});
		expect(cloud.reads("checkout", "ana").get(id)).toBe(at);

		// a second Mac of Ana's hears it at once, and whoever starts later is told by the team
		await anas.close();
		const again = await canvas(daemon(ana));
		await again.online();
		expect((await again.read()).reads).toEqual({ [id]: at });
		const unread = await again.call(`${id}/unread`, "POST");
		expect(await unread.json()).toMatchObject({ comment: { id }, read: null });
		expect((await again.read()).reads).toEqual({});
	});

	it("mentions members only, and lists them for the composer", async () => {
		const { anas, bens, id } = await thread();
		const { people } = (await (await anas.call("people", "GET")).json()) as {
			people: { accountId: string; name: string; you: boolean }[];
		};
		expect(people).toEqual(
			expect.arrayContaining([
				{ accountId: "ana", name: "ana", you: true },
				{ accountId: "ben", name: "ben", you: false },
			]),
		);
		await anas.write({ body: "@ben look", mentions: ["ben", "nobody"] });
		await eventually(async () => (await bens.read()).comments.length === 2);
		expect((await bens.read()).comments.at(-1)?.mentions).toEqual([
			{ accountId: "ben", name: "ben", color: TEAM_COLORS[1] },
		]);
		expect((await bens.reply(id, "@ana yes", ["ana"])).status).toBe(201);
		await eventually(async () => (await anas.read()).comments[0]?.replies.length === 2);
		expect((await anas.read()).comments[0]?.replies.at(-1)?.mentions).toMatchObject([{ accountId: "ana" }]);
		expect((await anas.write({ body: "x", mentions: "ben" })).status).toBe(400);
	});

	it("is refused offline, and over the limit says when to try again", async () => {
		const { cloud, ben, bens, id } = await thread();
		cloud.commentLimits({ perMinute: 1 });
		expect((await bens.reply(id, "one")).status).toBe(201);
		const limited = await bens.reply(id, "two");
		expect(limited.status).toBe(429);
		expect(await limited.json()).toMatchObject({ error: "rate_limited", retryAfter: expect.any(Number) });
		cloud.offline("ben");
		await eventually(async () => !(await bens.read()).online);
		expect((await bens.call(`${id}/resolve`, "POST")).status).toBe(409);
		expect(ben.root).toBeTruthy();
	});
});
