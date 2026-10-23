import { describe, expect, it } from "vitest";
import { readVersion } from "./history-version";

/** A version as the History pane shows it (task 225): what it did, what stands the same now, what a restore changes. */

const files = (entries: Record<string, string>) => entries;

describe("reading a version", () => {
	// before: cart, promo; then: cart changed, promo deleted, tip added; now: cart changed again, tip as then
	const before = files({
		"frames/shop/cart/frame.tsx": "c1",
		"frames/shop/promo/frame.tsx": "p1",
		"frames/home/frame.tsx": "h1",
	});
	const then = files({
		"frames/shop/cart/frame.tsx": "c2",
		"frames/shop/cart/frame.json": "j1",
		"frames/shop/tip/frame.tsx": "t1",
		"frames/home/frame.tsx": "h1",
	});
	const now = files({
		"frames/shop/cart/frame.tsx": "c3",
		"frames/shop/cart/frame.json": "j1",
		"frames/shop/tip/frame.tsx": "t1",
		"frames/shop/menu/frame.tsx": "m1",
		"frames/home/frame.tsx": "h1",
	});

	it("says what the version did to each frame on the page, and which stand the same now", () => {
		const read = readVersion({ then, before, now, page: "shop" });
		expect(read.frames).toEqual([
			{ name: "shop/cart", then: true, before: true, now: true, same: false, did: "changed" },
			{ name: "shop/menu", then: false, before: false, now: true, same: false, did: null },
			{ name: "shop/promo", then: false, before: true, now: false, same: false, did: "deleted" },
			{ name: "shop/tip", then: true, before: false, now: true, same: true, did: "added" },
		]);
		// the root page holds only its own frames
		expect(readVersion({ then, before, now, page: "" }).frames.map((frame) => frame.name)).toEqual(["home"]);
	});

	it("lists what a restore would change across the project: changed, back and gone", () => {
		expect(readVersion({ then, before, now, page: "shop" }).differs).toEqual([
			{ frame: "shop/cart", change: "changed" },
			{ frame: "shop/menu", change: "gone" },
		]);
		const later = { ...now };
		delete later["frames/shop/tip/frame.tsx"];
		expect(readVersion({ then, before, now: later, page: "shop" }).differs).toContainEqual({
			frame: "shop/tip",
			change: "back",
		});
	});

	it("offers the shared files that changed since, and then nothing stands the same", () => {
		const read = readVersion({
			then: { ...then, "shared/ui/button.tsx": "b1" },
			before,
			now: { ...now, "shared/ui/button.tsx": "b2", "shared/ui/new.tsx": "n1" },
			page: "shop",
		});
		expect(read.shared).toEqual(["shared/ui/button.tsx", "shared/ui/new.tsx"]);
		expect(read.frames.find((frame) => frame.name === "shop/tip")?.same).toBe(false);
	});

	it("keeps a nested frame's files its own", () => {
		const read = readVersion({
			then: { "frames/a/frame.tsx": "a1", "frames/a/b/frame.tsx": "b1" },
			before: { "frames/a/frame.tsx": "a1", "frames/a/b/frame.tsx": "b0" },
			now: { "frames/a/frame.tsx": "a1", "frames/a/b/frame.tsx": "b1" },
			page: "",
		});
		expect(read.frames).toEqual([{ name: "a", then: true, before: true, now: true, same: true, did: null }]);
	});
});
