import { describe, expect, it } from "vitest";
import type { Comment } from "../team-sync-protocol";
import { editedSince } from "./comment-edited";

const ana = { accountId: "acc-ana", name: "Ana", color: "#7aa7ff" };

const comment = (id: string, over: Partial<Comment> = {}): Comment => ({
	id,
	audience: "team",
	page: "",
	frame: "receipt",
	at: { x: 0, y: 0 },
	element: null,
	revision: "a".repeat(64),
	still: false,
	author: ana,
	agent: false,
	body: "words",
	created: 1,
	edited: null,
	resolved: null,
	standing: "placed",
	replies: [],
	...over,
});

describe("edited since", () => {
	it("names the comments whose frame's source moved on from the revision they kept, asking each frame once", async () => {
		const asked: string[] = [];
		const now: Record<string, string | null> = { receipt: "b".repeat(64), cart: "c".repeat(64), gone: null };
		const edited = await editedSince(
			[
				comment("k1"),
				comment("k2", { revision: "b".repeat(64) }),
				comment("k3"),
				comment("k4", { frame: "cart", revision: "c".repeat(64) }),
				comment("k5", { frame: "gone" }),
				comment("k6", { frame: null, revision: null }),
				comment("k7", { standing: "deleted-frame" }),
			],
			async (frame) => {
				asked.push(frame);
				return now[frame] ?? null;
			},
		);

		expect(edited).toEqual(["k1", "k3"]);
		expect(asked).toEqual(["receipt", "cart", "gone"]);
	});
});
