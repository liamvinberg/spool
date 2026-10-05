import { describe, expect, it } from "vitest";
import { saidAgo, shareWho } from "../../share-view";
import { leavingLinks } from "./share-sheet";
import { menuEntries } from "./sidebar-menu";

describe("sharing a page", () => {
	it("warns about each link that leaves the shared pages, once, and never about one that stays", () => {
		const walks = [
			{ from: "checkout/cart", to: "checkout/paid" },
			{ from: "checkout/cart", to: "menu/item" },
			{ from: "checkout/cart", to: "menu/item" },
			{ from: "checkout/paid", to: "home" },
			{ from: "menu/item", to: "checkout/cart" },
		];
		expect(leavingLinks(walks, new Set(["checkout"]))).toEqual([
			{ from: "checkout/cart", to: "menu/item", page: "menu" },
			{ from: "checkout/paid", to: "home", page: "" },
		]);
		expect(leavingLinks(walks, new Set(["checkout", "menu"]))).toEqual([
			{ from: "checkout/paid", to: "home", page: "" },
		]);
	});

	it("starts from a page's right-click only where the project can share", () => {
		const at = { pasteable: false, selection: 0, movable: true, unseen: 0 };
		const labels = (shareable: boolean) =>
			menuEntries({ kind: "page", page: "checkout" }, { ...at, shareable }).flatMap((entry) =>
				entry.rule === true ? [] : [entry.label],
			);
		expect(labels(true)).toContain("Share…");
		expect(labels(false)).not.toContain("Share…");
		// the root page has no row: it is shared from the rail's own list, the one its new pages start from
		const root = (shareable: boolean) =>
			menuEntries({ kind: "empty" }, { ...at, shareable }).some(
				(entry) => entry.rule !== true && entry.label === "Share…",
			);
		expect(root(true)).toBe(true);
		expect(root(false)).toBe(false);
		expect(
			menuEntries({ kind: "frame", name: "checkout/cart" }, { ...at, shareable: true }).some(
				(entry) => entry.rule !== true && entry.label === "Share…",
			),
		).toBe(false);
	});

	it("says whom a share is for and when, as people say it", () => {
		expect(shareWho({ kind: "link", people: [] })).toBe("anyone with the link");
		expect(shareWho({ kind: "people", people: ["kim@client.com", "ola.n@client.com"] })).toBe("kim and ola");
		expect(shareWho({ kind: "people", people: ["a@x.se", "b@x.se", "c@x.se"] })).toBe("a, b and c");
		const now = 2_000_000_000;
		expect(saidAgo(now - 20, now)).toBe("just now");
		expect(saidAgo(now - 150, now)).toBe("2 min ago");
		expect(saidAgo(now - 3600, now)).toBe("an hour ago");
		expect(saidAgo(now - 86_400, now)).toBe("yesterday");
	});
});
