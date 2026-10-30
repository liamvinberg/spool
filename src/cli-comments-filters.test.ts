import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mac, team } from "./cli-comments-test-helpers";
import { CONTROL_HEADER } from "./daemon/security";

/**
 * `spool comments` through the real CLI against the fake spool.page (spool#172): what an agent prints and writes on
 * a team project, read from the daemon's snapshot and written through it as the person's agent. Assertions are on
 * what the verb prints and on what a teammate's Mac then reads, never on the messages in between.
 */

describe("spool comments", { timeout: 90_000 }, () => {
	it("says what isn't there, and filters by page and frame with a line that still says how old it is", async () => {
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

		// filtered by frame and by page
		const filed = await anas.spool("add", "receipt", "No pointer here.");
		expect(filed.status).toBe(0);

		const onFrame = await anas.spool("list", "--frame", "receipt");
		expect(onFrame.stdout).toContain("1 open comment, live from spool.page\n\n");
		expect(onFrame.stdout).toContain("on receipt — design/frames/receipt/frame.tsx\n");

		const elsewhere = await anas.spool("--page", "shop");
		expect(elsewhere.status).toBe(0);
		expect(elsewhere.stdout).toBe("0 open comments, live from spool.page\n");
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
