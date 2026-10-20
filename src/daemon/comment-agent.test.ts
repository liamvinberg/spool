import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fetchLocalCopy, openProject } from "../open";
import type { Comment } from "../team-sync-protocol";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { agentReader, makeApp, makeTempDir, replayAgentExecutor } from "../test-helpers";
import { writeCover } from "./thumbs";

/**
 * A comment sent to the agent (spool#172): the turn's prompt carries it as the one `<comment>` block the verb prints,
 * read from the daemon's snapshot at the send, and when the frame was edited since, the still the comment kept of
 * it rides along as a picture, asked of the team when this Mac never had it. Assertions are on what the agent is
 * sent, never on what passed between a daemon and the team.
 */

/** A PNG as the booth draws a frame's cover: what a comment keeps as its still. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const RECEIPT =
	"export default function Receipt() {\n\treturn (\n\t\t<main>\n\t\t\t<h2>Thanks!</h2>\n\t\t</main>\n\t);\n}\n";

function repo(): string {
	const root = join(makeTempDir(), "checkout");
	mkdirSync(root);
	execFileSync("git", ["init", "--quiet", "--initial-branch=main", "."], { cwd: root });
	return realpathSync(root);
}

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
	mkdirSync(join(anaRoot, "design", "frames", "receipt"), { recursive: true });
	writeFileSync(join(anaRoot, "design", "frames", "receipt", "frame.tsx"), RECEIPT);
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

async function eventually(holds: () => Promise<boolean>, ms = 8000): Promise<void> {
	const start = Date.now();
	while (!(await holds())) {
		if (Date.now() - start > ms) throw new Error("it never held");
		await new Promise((wake) => setTimeout(wake, 25));
	}
}

type Read = { online: boolean; comments: Comment[] };
const read = async (app: ReturnType<typeof makeApp>) =>
	(await (await app.request("/api/p/checkout/comments")).json()) as Read;

/** One turn, said with comments, read to its end. */
async function sayWith(app: ReturnType<typeof makeApp>, thread: string, comments: string[]) {
	const res = await app.request("/api/p/checkout/agent/turn", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ thread, said: [{ prompt: "Deal with this.", comments }] }),
	});
	expect(res.status).toBe(200);
	const events = agentReader(res);
	for (;;) {
		const next = await events.next(8000).catch(() => undefined);
		if (next === undefined || (next.data as { kind?: string }).kind === "closed") break;
	}
}

/** What the agent was sent, as content blocks. */
function sent(
	input: string | undefined,
): { type: string; text?: string; source?: { media_type?: string; data?: string } }[] {
	const line = JSON.parse(input ?? "{}") as { message?: { content?: unknown } };
	return (line.message?.content ?? []) as { type: string; text?: string }[];
}

describe("a comment sent to the agent", () => {
	it("is its block ahead of the words, and once the frame changed, the still it kept rides along", async () => {
		const { ana, ben } = await team();
		const anas = makeApp(ana.state, { cloud: ana.cloud, teamNotice: () => {} });
		const agent = replayAgentExecutor("claude-compact");
		const bens = makeApp(ben.state, { cloud: ben.cloud, teamNotice: () => {}, agentExecutor: agent.executor });
		await eventually(async () => (await read(anas)).online && (await read(bens)).online);
		// Ana's Mac has drawn the frame, so her comment keeps that picture; Ben's never had it
		writeCover(ana.root, "receipt", PNG);
		const written = await anas.request("/api/p/checkout/comments", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				page: "",
				frame: "receipt",
				at: { x: 120, y: 64 },
				element: {
					selector: "main > h2",
					outerHtml: "<h2>Thanks!</h2>",
					source: "frames/receipt/frame.tsx:4:4",
					generated: false,
				},
				body: "Thanks! is loud for a receipt.",
			}),
		});
		const { id } = (await written.json()) as { id: string };
		await eventually(async () => (await read(bens)).comments.length === 1);

		await sayWith(bens, "1f0e2d3c-4b5a-4697-8899-aabbccddee01", [id]);
		const block = [
			`<comment id="${id}">`,
			"ana, to the team, open",
			"on receipt · h2 — design/frames/receipt/frame.tsx:4-4",
			"  <h2>Thanks!</h2>",
			"ana: Thanks! is loud for a receipt.",
			"</comment>",
		];
		expect(sent(agent.spawned[0]?.inputs[0])).toEqual([
			{ type: "text", text: `${block.join("\n")}\n\nDeal with this.` },
		]);

		// Ben's Mac changes the frame: the comment was made on what it was, so the agent sees that too
		writeFileSync(join(ben.root, "design", "frames", "receipt", "frame.tsx"), RECEIPT.replace("Thanks!", "Paid"));
		// the team takes the save and says the comment's frame was edited since: the one word every reader goes by
		await eventually(async () => (await read(bens)).comments[0]?.editedSince === true);
		await sayWith(bens, "1f0e2d3c-4b5a-4697-8899-aabbccddee02", [id]);
		const content = sent(agent.spawned[1]?.inputs[0]);
		expect(content.find((one) => one.type === "text")?.text).toContain(
			"\nedited since: the frame changed after this comment was made; the image attached is the frame as it was then\n",
		);
		expect(content.find((one) => one.type === "image")?.source).toMatchObject({
			media_type: "image/png",
			data: PNG.toString("base64"),
		});
	});

	it("says a comment that isn't there anymore is gone, rather than leaving it out", async () => {
		const { ben } = await team();
		const agent = replayAgentExecutor("claude-compact");
		const bens = makeApp(ben.state, { cloud: ben.cloud, teamNotice: () => {}, agentExecutor: agent.executor });
		await eventually(async () => (await read(bens)).online);

		await sayWith(bens, "1f0e2d3c-4b5a-4697-8899-aabbccddee03", ["nothere1"]);
		expect(sent(agent.spawned[0]?.inputs[0])[0]?.text).toBe(
			'<comment id="nothere1">\nthis comment isn\'t there anymore\n</comment>\n\nDeal with this.',
		);
	});
});
