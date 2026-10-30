import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mac, team } from "./cli-comments-test-helpers";

/**
 * `spool comments` through the real CLI against the fake spool.page (spool#172): what an agent prints and writes on
 * a team project, read from the daemon's snapshot and written through it as the person's agent. Assertions are on
 * what the verb prints and on what a teammate's Mac then reads, never on the messages in between.
 */

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
});
