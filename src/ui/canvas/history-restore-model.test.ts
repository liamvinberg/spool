import { describe, expect, it } from "vitest";
import type { HistoryStretch } from "../api";
import {
	momentSays,
	questionSays,
	restoredSays,
	restoreTargets,
	sharedSays,
	targetSays,
	undoOf,
} from "./history-restore-model";

/**
 * How the History pane says a restore (spool#188), as #105's prototype words it: what can go back from a stretch,
 * the one question asked first, the shared file offered beside a frame, the row a restore makes and its undo.
 */

const WEDNESDAY = new Date(2026, 9, 21).getTime();
const at = (hours: number, minutes = 0) => WEDNESDAY + hours * 3_600_000 + minutes * 60_000;
const NOW = at(16);

function stretch(over: Partial<HistoryStretch> = {}): HistoryStretch {
	return {
		from: 40,
		to: 52,
		start: at(14),
		end: at(14, 52),
		by: { accountId: "ben", name: "Ben", color: "x", device: "Mac" },
		saves: 12,
		setAside: 0,
		paths: ["frames/checkout/cart/frame.tsx", "frames/checkout/receipt/frame.tsx", "shared/ui/order-button.tsx"],
		more: 0,
		restore: null,
		...over,
	};
}

describe("restoring, as the pane says it", () => {
	it("names what goes back", () => {
		expect(targetSays({ kind: "file", target: "frames/checkout/cart/frame.tsx" })).toBe("frame.tsx");
		expect(targetSays({ kind: "frame", target: "checkout/cart" })).toBe("cart");
		expect(targetSays({ kind: "page", target: "checkout" })).toBe("the checkout page");
		expect(targetSays({ kind: "page", target: "" })).toBe("the root page");
		expect(targetSays({ kind: "project", target: "" })).toBe("the whole project");
	});

	it("names the moment by its time and day", () => {
		expect(momentSays(at(14, 52), NOW)).toBe("14:52 today");
		expect(momentSays(at(14, 52) - 86_400_000, NOW)).toBe("14:52 yesterday");
		expect(momentSays(at(9, 5) - 4 * 86_400_000, NOW)).toBe("09:05 Sat 17 Oct");
	});

	it("offers a frame's history its frame, and the project's each frame and page the stretch touched and the whole", () => {
		expect(restoreTargets(stretch(), { kind: "frame", frame: "checkout/cart" })).toEqual([
			{ kind: "frame", target: "checkout/cart" },
		]);
		expect(restoreTargets(stretch(), { kind: "project" })).toEqual([
			{ kind: "frame", target: "checkout/cart" },
			{ kind: "frame", target: "checkout/receipt" },
			{ kind: "page", target: "checkout" },
			{ kind: "project", target: "" },
		]);
	});

	it("asks once, saying it reaches the team as new saves and can be undone", () => {
		expect(questionSays({ kind: "frame", target: "checkout/cart" }, at(14, 52), 2, "Ben", NOW)).toEqual({
			title: "Restore cart to 14:52 today?",
			description:
				"2 files go back to how they stood after Ben's saves ended. It reaches the team as new saves, so the history keeps today's version and the restore can be undone.",
		});
		expect(questionSays({ kind: "file", target: "shared/ui/go.tsx" }, at(14, 52), 1, "Ben", NOW).description).toMatch(
			/^1 file goes back to how it stood after Ben's saves ended\./u,
		);
	});

	it("offers a shared file naming the other frames that use it", () => {
		expect(sharedSays("checkout/cart", ["menu", "receipt", "welcome"])).toBe(
			"cart imports it and it changed since. menu, receipt and welcome use it too.",
		);
		expect(sharedSays("checkout/cart", ["menu"])).toBe("cart imports it and it changed since. menu uses it too.");
		expect(sharedSays("checkout/cart", [])).toBe("cart imports it and it changed since.");
	});

	it("says a restore's row and its toast: what went back to when", () => {
		const restore = { id: "r", kind: "frame" as const, target: "checkout/cart", to: 52, toAt: at(14, 52) };
		expect(restoredSays(restore, NOW)).toBe("cart to 14:52 today");
	});

	it("undoes a restore as a restore of its paths to the version just before it", () => {
		const restore = { id: "r", kind: "frame" as const, target: "checkout/cart", to: 30, toAt: at(11) };
		expect(undoOf(stretch({ from: 60, to: 61, restore }), ["frames/checkout/cart/frame.tsx"])).toEqual({
			kind: "frame",
			target: "checkout/cart",
			to: 59,
			paths: ["frames/checkout/cart/frame.tsx"],
		});
	});
});
