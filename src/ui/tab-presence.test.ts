import { describe, expect, it } from "vitest";
import { PRESENCE_IDLE_MS } from "../team-sync-protocol";
import { heardAt, nextIdle, tabMates } from "./tab-presence";

const ana = { accountId: "ana", name: "ana", color: "#7aa7ff" };
const ben = { accountId: "ben", name: "ben", color: "#eaa94a" };
const cleo = { accountId: "cleo", name: "cleo", color: "#4cc495" };

describe("who a tab shows", () => {
	it("puts the people working before the idle ones, keeping the order they were said in", () => {
		const heard = heardAt(
			[
				{ person: ana, quiet: PRESENCE_IDLE_MS + 1 },
				{ person: ben, quiet: 0 },
				{ person: cleo, quiet: 10 },
			],
			1_000_000,
		);
		expect(tabMates(heard, 1_000_000).map(({ name, idle }) => [name, idle])).toEqual([
			["ben", false],
			["cleo", false],
			["ana", true],
		]);
	});

	it("goes idle by the clock alone, and says when the next one does", () => {
		const heard = heardAt(
			[
				{ person: ana, quiet: 10_000 },
				{ person: ben, quiet: 50_000 },
			],
			100_000,
		);
		expect(nextIdle(heard, 100_000)).toBe(100_000 + PRESENCE_IDLE_MS - 50_000);
		const later = 100_000 + PRESENCE_IDLE_MS - 50_000;
		expect(tabMates(heard, later).find((mate) => mate.name === "ben")?.idle).toBe(true);
		expect(tabMates(heard, later).find((mate) => mate.name === "ana")?.idle).toBe(false);
		expect(nextIdle(heard, 100_000 + PRESENCE_IDLE_MS)).toBeUndefined();
	});
});
