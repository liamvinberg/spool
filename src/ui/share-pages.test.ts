import { describe, expect, it } from "vitest";
import { ROOT_PAGE } from "../page-path";
import { saidAgo, shareWho } from "../share-view";
import { menuEntries } from "./canvas/sidebar-menu";
import {
	foundAt,
	foundRows,
	leavingLinks,
	pickRows,
	pressed,
	saidChoice,
	saidSize,
	shownRows,
	tickOf,
} from "./share-pages";
import { refusalSaid } from "./shares";

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

	it("says why a share wasn't made in words, a team gone local's as Home says it", () => {
		expect(refusalSaid("unpaid")).toBe(
			"This team has gone local. An admin can pay for it in Settings › Billing to sync again.",
		);
		expect(refusalSaid("editor_required")).toBe("Only editors and admins change shares.");
		expect(refusalSaid("something_new")).toBe("spool.page couldn't do that just now.");
	});

	it("says whom a share is for and when, as people say it", () => {
		expect(shareWho({ kind: "link", people: [] })).toBe("anyone with the link");
		// an invitee is their address before the @, as anyone without a name is
		expect(shareWho({ kind: "people", people: ["kim@client.com", "ola.n@client.com"] })).toBe("kim and ola.n");
		expect(shareWho({ kind: "people", people: ["a@x.se", "b@x.se", "c@x.se"] })).toBe("a, b and c");
		const now = 2_000_000_000;
		expect(saidAgo(now - 20, now)).toBe("just now");
		expect(saidAgo(now - 150, now)).toBe("2 min ago");
		expect(saidAgo(now - 3600, now)).toBe("an hour ago");
		expect(saidAgo(now - 86_400, now)).toBe("yesterday");
	});

	const pages = ["explore", "explore/cloud", "explore/cloud/home", "explore/cloud/moves", "explore/rail", "app"];
	const frames = new Map([
		["app", 3],
		["explore/cloud/home", 2],
		["explore/cloud/moves", 4],
		["explore/rail", 1],
	]);

	it("lays the pages out as a tree whose folders take every page under them", () => {
		const rows = pickRows(pages, frames);
		expect(rows.map((row) => [row.page, row.depth, row.folder])).toEqual([
			["app", 0, false],
			["explore", 0, true],
			["explore/cloud", 1, true],
			["explore/cloud/home", 2, false],
			["explore/cloud/moves", 2, false],
			["explore/rail", 1, false],
		]);
		expect(rows.find((row) => row.page === "explore/cloud")?.takes).toEqual([
			"explore/cloud",
			"explore/cloud/home",
			"explore/cloud/moves",
		]);
		// the top page has a row only once frames stand on it
		expect(pickRows(pages, new Map([...frames, [ROOT_PAGE, 2]]))[0]?.page).toBe(ROOT_PAGE);
	});

	it("takes a folder whole, lets it go whole, and says when only some of it is chosen", () => {
		const rows = pickRows(pages, frames);
		const explore = rows.find((row) => row.page === "explore");
		const cloud = rows.find((row) => row.page === "explore/cloud");
		if (explore === undefined || cloud === undefined) throw new Error("missing rows");
		let chosen: ReadonlySet<string> = new Set(["app"]);
		chosen = pressed(cloud, chosen);
		expect([...chosen].sort()).toEqual(["app", "explore/cloud", "explore/cloud/home", "explore/cloud/moves"]);
		expect(tickOf(cloud, chosen)).toBe("all");
		expect(tickOf(explore, chosen)).toBe("some");
		// a folder partly chosen takes the rest on a press, and a second press lets all of it go
		chosen = pressed(explore, chosen);
		expect(tickOf(explore, chosen)).toBe("all");
		chosen = pressed(explore, chosen);
		expect([...chosen]).toEqual(["app"]);
	});

	it("shows a row only under open folders, and finds pages by their own name", () => {
		const rows = pickRows(pages, frames);
		expect(shownRows(rows, new Set()).map((row) => row.page)).toEqual(["app", "explore"]);
		expect(shownRows(rows, new Set(["explore"])).map((row) => row.page)).toEqual([
			"app",
			"explore",
			"explore/cloud",
			"explore/rail",
		]);
		const found = foundRows(rows, " MO ");
		expect(found.map((row) => [row.page, foundAt(row)])).toEqual([["explore/cloud/moves", "explore/cloud"]]);
		expect(foundRows(rows, "")).toEqual([]);
	});

	it("says a choice by its folders and its size in pages and frames", () => {
		const rows = pickRows(pages, frames);
		const cloud = new Set(["app", "explore/cloud", "explore/cloud/home", "explore/cloud/moves"]);
		expect(saidChoice(cloud, rows)).toBe("app, explore/cloud");
		expect(saidSize(cloud, frames)).toBe("4 pages · 9 frames");
		expect(saidSize(new Set(["explore/rail"]), frames)).toBe("1 page · 1 frame");
		expect(saidChoice(new Set(["a", "b", "c", "d"]), [])).toBe("a, b and 2 more");
	});
});
