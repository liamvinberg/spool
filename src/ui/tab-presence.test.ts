import { describe, expect, it } from "vitest";
import { PRESENCE_AWAY_MS, PRESENCE_GONE_MS, PRESENCE_UNFOCUSED_MS } from "../team-sync-protocol";
import { heardAt, nextTabChange, tabMates } from "./tab-presence";

const ana = { accountId: "ana", name: "ana", color: "#7aa7ff" };
const ben = { accountId: "ben", name: "ben", color: "#eaa94a" };
const cleo = { accountId: "cleo", name: "cleo", color: "#4cc495" };
const dag = { accountId: "dag", name: "dag", color: "#58c6dc" };

describe("who a tab shows", () => {
	it("puts the active before the unfocused, keeping the order they were said in, and leaves the away out", () => {
		const heard = heardAt(
			[
				{ person: ana, quiet: PRESENCE_UNFOCUSED_MS + 1 },
				{ person: ben, quiet: 0 },
				{ person: cleo, quiet: 10, focus: "blurred" },
				{ person: dag, quiet: 10, focus: "hidden" },
			],
			1_000_000,
		);
		expect(tabMates(heard, 1_000_000).map(({ name, look }) => [name, look])).toEqual([
			["ben", "active"],
			["ana", "unfocused"],
			["cleo", "unfocused"],
		]);
	});

	it("dims and drops people by the clock alone, and says when the next one changes", () => {
		const heard = heardAt(
			[
				{ person: ana, quiet: 10_000 },
				{ person: ben, quiet: 50_000 },
			],
			100_000,
		);
		const dims = 100_000 + PRESENCE_UNFOCUSED_MS - 50_000;
		expect(nextTabChange(heard, 100_000)).toBe(dims);
		expect(tabMates(heard, dims).find((mate) => mate.name === "ben")?.look).toBe("unfocused");
		expect(tabMates(heard, dims).find((mate) => mate.name === "ana")?.look).toBe("active");
		expect(nextTabChange(heard, 100_000 + PRESENCE_AWAY_MS - 50_000)).toBe(100_000 + PRESENCE_AWAY_MS - 10_000);
		expect(tabMates(heard, 100_000 + PRESENCE_AWAY_MS - 50_000).map((mate) => mate.name)).toEqual(["ana"]);
		expect(nextTabChange(heard, 100_000 + PRESENCE_GONE_MS)).toBeUndefined();
	});
});
