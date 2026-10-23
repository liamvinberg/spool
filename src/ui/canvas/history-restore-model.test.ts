import { describe, expect, it } from "vitest";
import type { HistoryStretch } from "../api";
import {
	changeSays,
	didSays,
	framesSays,
	momentSays,
	restoredSays,
	restoreLabel,
	stepOf,
	targetSays,
	tickedAtFirst,
	undoOf,
	versionRestore,
} from "./history-restore-model";

/**
 * How the History pane says a version and its restore (task 225): what a version did, what its restore changes and
 * ticks, the restore it makes, the row it leaves and its undo, and the versions ↑ ↓ walk.
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

	it("says what a version did to a frame and what its restore does", () => {
		expect(didSays("deleted")).toBe("deleted here");
		expect(didSays("changed")).toBe("changed");
		expect(changeSays("changed")).toBe("goes back to how it was");
		expect(changeSays("back")).toBe("comes back");
		expect(changeSays("gone")).toBe("goes, it didn't exist then");
	});

	it("ticks every frame in the project's history, and the frame alone in its own", () => {
		const differs = [{ frame: "checkout/cart" }, { frame: "checkout/promo" }];
		expect(tickedAtFirst(differs, { kind: "project" })).toEqual(["checkout/cart", "checkout/promo"]);
		expect(tickedAtFirst(differs, { kind: "frame", frame: "checkout/promo" })).toEqual(["checkout/promo"]);
		expect(tickedAtFirst(differs, { kind: "frame", frame: "menu" })).toEqual(["checkout/cart", "checkout/promo"]);
		expect(restoreLabel(2, 2)).toBe("Restore");
		expect(restoreLabel(1, 2)).toBe("Restore 1 of 2");
	});

	it("restores one ticked frame as the frame's restore, several as the project's, by their folders", () => {
		expect(versionRestore(52, ["checkout/cart"], [])).toEqual({
			kind: "frame",
			target: "checkout/cart",
			to: 52,
			frames: ["checkout/cart"],
			also: [],
		});
		expect(versionRestore(52, ["checkout/cart", "menu"], ["shared/ui/x.tsx"])).toEqual({
			kind: "project",
			target: "",
			to: 52,
			frames: ["checkout/cart", "menu"],
			also: ["shared/ui/x.tsx"],
		});
	});

	it("walks the versions: down is older, up is newer, above the newest is now", () => {
		const one = stretch({ from: 50, to: 52 });
		const two = stretch({ from: 40, to: 45 });
		expect(stepOf([one, two], null, 1)).toBe(one);
		expect(stepOf([one, two], one, 1)).toBe(two);
		expect(stepOf([one, two], two, 1)).toBeUndefined();
		expect(stepOf([one, two], two, -1)).toBe(one);
		expect(stepOf([one, two], one, -1)).toBeNull();
	});

	it("says a restore's row and its toast: what went back to when", () => {
		const restore = { id: "r", kind: "frame" as const, target: "checkout/cart", to: 52, toAt: at(14, 52) };
		expect(restoredSays(restore, [], NOW)).toBe("cart to 14:52 today");
		// a version's restore of some frames names them from its saves
		const some = { id: "r", kind: "project" as const, target: "", to: 52, toAt: at(14, 52) };
		const paths = [
			"frames/checkout/cart/frame.tsx",
			"frames/checkout/promo/frame.tsx",
			"frames/checkout/promo/frame.json",
		];
		expect(restoredSays(some, paths, NOW)).toBe("cart and promo to 14:52 today");
		expect(restoredSays(some, [], NOW)).toBe("the whole project to 14:52 today");
		expect(framesSays(["a", "b", "c", "d"])).toBe("4 frames");
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
