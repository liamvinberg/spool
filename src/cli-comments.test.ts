import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { spoolAsync } from "./cli-test-helpers";
import { CONTROL_HEADER } from "./daemon/security";
import { serveDaemon } from "./daemon/server";
import { initTeamProject } from "./init";
import { fetchLocalCopy, openProject } from "./open";
import { fakeTeam, TEAM_ORIGIN } from "./team-sync-test-harness";
import { makeTempDir } from "./test-helpers";

/**
 * `spool comments` through the real CLI against the fake spool.page (spool#172): what an agent prints and writes on
 * a team project, read from the daemon's snapshot and written through it as the person's agent. Assertions are on
 * what the verb prints and on what a teammate's Mac then reads, never on the messages in between.
 */

function repo(): string {
	const root = join(makeTempDir(), "checkout");
	mkdirSync(root);
	execFileSync("git", ["init", "--quiet", "--initial-branch=main", "."], { cwd: root });
	return realpathSync(root);
}

/** Ana starts the team project with a receipt frame on the root page and a cart on the shop page; Ben's clone fetches it. */
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
	const receipt = join(anaRoot, "design", "frames", "receipt");
	mkdirSync(receipt, { recursive: true });
	writeFileSync(
		join(receipt, "frame.tsx"),
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

type Machine = { root: string; state: string; cloud: ReturnType<ReturnType<typeof fakeTeam>["machine"]>["cloud"] };

/** The machine's daemon, really served, and its `spool` at a terminal in the project. */
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
	const read = async () =>
		(await (
			await fetch(`${daemon.url}/api/p/checkout/comments`, { headers: { [CONTROL_HEADER]: daemon.controlToken } })
		).json()) as {
			online: boolean;
			comments: {
				id: string;
				body: string;
				agent: boolean;
				resolved: { by: { name: string }; agent?: true } | null;
				standing: string;
				replies: { agent: boolean; body: string }[];
				editedSince?: true;
			}[];
		};
	return {
		read,
		url: daemon.url,
		token: daemon.controlToken,
		/** What the person's canvas sends, as themself: a POST to one of the comment routes, with no body. */
		call: (path: string) =>
			fetch(`${daemon.url}/api/p/checkout/comments/${path}`, {
				method: "POST",
				headers: { [CONTROL_HEADER]: daemon.controlToken },
			}),
		async online(): Promise<void> {
			const start = Date.now();
			while (!(await read()).online) {
				if (Date.now() - start > 8000) throw new Error("never connected");
				await new Promise((wake) => setTimeout(wake, 25));
			}
		},
		async until(holds: (comments: Awaited<ReturnType<typeof read>>["comments"]) => boolean): Promise<void> {
			const start = Date.now();
			while (!holds((await read()).comments)) {
				if (Date.now() - start > 8000) throw new Error("it never held");
				await new Promise((wake) => setTimeout(wake, 25));
			}
		},
		spool: (...args: string[]) => spoolAsync(["comments", ...args], home, machine.root, { SPOOL_DIR: machine.state }),
	};
}

describe("spool comments", { timeout: 90_000 }, () => {
	it("adds a comment as the person's agent, which a teammate's agent lists, shows and answers", async () => {
		const { ana, ben } = await team();
		const anas = await mac(ana);
		const bens = await mac(ben);
		await anas.online();
		await bens.online();

		const added = await bens.spool("add", "receipt", "Thanks! is loud for a receipt.", "--element", "main > h2");
		expect(added.stderr).toBe("");
		expect(added.status).toBe(0);
		const id = /^added (\S+) on receipt\n$/.exec(added.stdout)?.[1] ?? "";
		expect(id).not.toBe("");
		await anas.until((comments) => comments.some((comment) => comment.id === id));

		const listed = await anas.spool();
		expect(listed.status).toBe(0);
		expect(listed.stdout).toBe(
			[
				"1 open comment, live from spool.page",
				"",
				`<comment id="${id}">`,
				"ben's agent, to the team, open",
				"on receipt · h2 — design/frames/receipt/frame.tsx:4-4",
				"  <h2>Thanks!</h2>",
				"ben's agent: Thanks! is loud for a receipt.",
				"</comment>",
				"",
			].join("\n"),
		);

		const replied = await anas.spool("reply", id, "Toned", "it", "down.");
		expect(replied.status).toBe(0);
		expect(replied.stdout).toMatch(new RegExp(`^replied to ${id} \\(reply \\S+\\)\\n$`));
		// on Ben's Mac, the reply is Ana's agent's
		await bens.until((comments) => comments.some((comment) => comment.replies.length > 0));
		const reply = (await bens.read()).comments[0]?.replies[0];
		expect(reply).toMatchObject({ agent: true, body: "Toned it down." });

		const shown = await bens.spool("show", id);
		expect(shown.status).toBe(0);
		expect(shown.stdout).toContain(
			"\nben's agent: Thanks! is loud for a receipt.\nana's agent: Toned it down.\n</comment>\n",
		);
		expect(shown.stdout).not.toContain("edited since");

		// Ana edits the frame's source: the team says the comment's frame moved on, and so does the verb
		writeFileSync(
			join(ana.root, "design", "frames", "receipt", "frame.tsx"),
			"export default function Receipt() {\n\treturn (\n\t\t<main>\n\t\t\t<h2>Paid</h2>\n\t\t</main>\n\t);\n}\n",
		);
		await bens.until((comments) => comments.some((comment) => comment.editedSince === true));
		expect((await bens.spool("show", id)).stdout).toContain(
			"\nedited since: the frame changed after this comment was made",
		);
	});

	it("filters by page and frame, and lists nothing with a line that still says how old it is", async () => {
		const { ana } = await team();
		const anas = await mac(ana);
		await anas.online();
		const added = await anas.spool("add", "receipt", "No pointer here.");
		expect(added.status).toBe(0);

		const onFrame = await anas.spool("list", "--frame", "receipt");
		expect(onFrame.stdout).toContain("1 open comment, live from spool.page\n\n");
		expect(onFrame.stdout).toContain("on receipt — design/frames/receipt/frame.tsx\n");

		const elsewhere = await anas.spool("--page", "shop");
		expect(elsewhere.status).toBe(0);
		expect(elsewhere.stdout).toBe("0 open comments, live from spool.page\n");
	});

	it("reads offline from the snapshot and says when it was heard, and refuses to write", async () => {
		const { cloud, ana, ben } = await team();
		const anas = await mac(ana);
		const bens = await mac(ben);
		await anas.online();
		await bens.online();
		const added = await bens.spool("add", "receipt", "The total is cut off.");
		const id = /^added (\S+)/.exec(added.stdout)?.[1] ?? "";
		await anas.until((comments) => comments.length === 1);

		cloud.offline("ana");
		const listed = await anas.spool();
		expect(listed.status).toBe(0);
		expect(listed.stdout).toMatch(
			/^1 open comment, offline: as spool\.page sent them under a minute ago\n\n<comment /,
		);
		expect(listed.stdout).toContain("ben's agent: The total is cut off.\n");

		const replied = await anas.spool("reply", id, "On it.");
		expect(replied.status).toBe(1);
		expect(replied.stderr).toContain("offline: comments need spool.page");
	});

	it("resolves as the person's agent, which anyone can reopen, and resolves and reopens again", async () => {
		const { cloud, ana, ben } = await team();
		const anas = await mac(ana);
		const bens = await mac(ben);
		await anas.online();
		await bens.online();
		const added = await bens.spool("add", "receipt", "The total is cut off.");
		const id = /^added (\S+)/.exec(added.stdout)?.[1] ?? "";
		await anas.until((comments) => comments.some((comment) => comment.id === id));

		const resolved = await anas.spool("resolve", id);
		expect(resolved.stderr).toBe("");
		expect(resolved.stdout).toBe(`resolved ${id}\n`);
		// on Ben's Mac it is resolved by Ana's agent, and out of the open list
		await bens.until((comments) => comments.some((comment) => comment.resolved !== null));
		expect((await bens.read()).comments[0]?.resolved).toMatchObject({ by: { name: "ana" }, agent: true });
		expect((await bens.spool()).stdout).toBe("0 open comments, live from spool.page\n");
		const all = await bens.spool("--resolved");
		expect(all.stdout).toContain(`<comment id="${id}">\nben's agent, to the team, resolved by ana's agent\n`);

		// Ben reopens it on his canvas, as himself
		expect((await bens.call(`${id}/reopen`)).status).toBe(200);
		await anas.until((comments) => comments.every((comment) => comment.resolved === null));
		expect((await anas.spool()).stdout).toContain("1 open comment, live from spool.page\n");

		// and Ben's agent resolves it, and Ana's agent reopens that
		expect((await bens.spool("resolve", id)).status).toBe(0);
		await anas.until((comments) => comments.some((comment) => comment.resolved !== null));
		expect((await anas.spool("show", id)).stdout).toContain("ben's agent, to the team, resolved by ben's agent\n");
		const reopened = await anas.spool("reopen", id);
		expect(reopened.stderr).toBe("");
		expect(reopened.stdout).toBe(`reopened ${id}\n`);
		await bens.until((comments) => comments.every((comment) => comment.resolved === null));

		// a comment that isn't there, and no team to tell
		const lost = await anas.spool("resolve", "nothere1");
		expect(lost.status).toBe(1);
		expect(lost.stderr).toContain("that comment isn't there anymore");
		cloud.offline("ana");
		const offline = await anas.spool("resolve", id);
		expect(offline.status).toBe(1);
		expect(offline.stderr).toContain("offline: comments need spool.page");
	});

	it("says what isn't there: a comment by id, and an element on the frame", async () => {
		const { ana } = await team();
		const anas = await mac(ana);
		await anas.online();

		const shown = await anas.spool("show", "nothere1");
		expect(shown.status).toBe(1);
		expect(shown.stderr).toContain("no comment nothere1 in what spool.page sent, live from spool.page");

		const replied = await anas.spool("reply", "nothere1", "Hello?");
		expect(replied.status).toBe(1);
		expect(replied.stderr).toContain("that comment isn't there anymore");

		const added = await anas.spool("add", "receipt", "Here.", "--element", "footer");
		expect(added.status).toBe(1);
		expect(added.stderr).toContain('nothing on receipt matches "footer"');

		// a frame that isn't there takes no pin, which nobody would ever see
		const nowhere = await anas.spool("add", "receipts", "Here.");
		expect(nowhere.status).toBe(1);
		expect(nowhere.stderr).toContain("there's no frame receipts");
		expect((await anas.read()).comments).toEqual([]);
	});

	it("says a reply on a share's comment is a draft that waits for its person", async () => {
		const { cloud, ana, ben } = await team();
		const anas = await mac(ana);
		const bens = await mac(ben);
		await anas.online();
		await bens.online();
		cloud.share("checkout", "s1", { pages: [""], by: "ana" });
		const posted = await fetch(`${anas.url}/api/p/checkout/comments`, {
			method: "POST",
			headers: { [CONTROL_HEADER]: anas.token, "content-type": "application/json" },
			body: JSON.stringify({
				page: "",
				frame: "receipt",
				at: { x: 0, y: 0 },
				body: "For the client",
				audience: { share: "s1" },
			}),
		});
		const { id } = (await posted.json()) as { id: string };
		await bens.until((comments) => comments.some((comment) => comment.id === id));

		const replied = await bens.spool("reply", id, "Fixed", "it.");
		expect(replied.stderr).toBe("");
		expect(replied.stdout).toMatch(
			new RegExp(
				`^drafted a reply to ${id} \\(reply \\S+\\): it's a share's comment, so the reply waits on its card for your person to send it\\n$`,
			),
		);
		expect((await bens.spool("show", id)).stdout).toContain("\nben's agent, a draft not sent: Fixed it.\n");
	});

	it("files a deleted page's comments with the closed ones, as the canvas does", async () => {
		const { ana } = await team();
		const anas = await mac(ana);
		await anas.online();
		const cart = join(ana.root, "design", "frames", "shop", "cart");
		mkdirSync(cart, { recursive: true });
		writeFileSync(join(cart, "frame.tsx"), "export default function Cart() {\n\treturn <main>Cart</main>;\n}\n");
		const added = await (async () => {
			for (const start = Date.now(); Date.now() - start < 8000; ) {
				const tried = await anas.spool("add", "shop/cart", "The cart is empty.");
				if (tried.status === 0) return tried;
				await new Promise((wake) => setTimeout(wake, 100));
			}
			throw new Error("the cart never stood");
		})();
		const id = /^added (\S+)/.exec(added.stdout)?.[1] ?? "";
		expect((await anas.spool()).stdout).toContain("1 open comment, live from spool.page\n");

		rmSync(join(ana.root, "design", "frames", "shop"), { recursive: true });
		await anas.until((comments) => comments.some((comment) => comment.standing === "deleted-page"));
		expect((await anas.spool()).stdout).toBe("0 open comments, live from spool.page\n");
		expect((await anas.spool("--resolved")).stdout).toContain(
			`<comment id="${id}">\nana's agent, to the team, page deleted\non page shop, which was deleted\n`,
		);
	});
});
