import { describe, expect, it } from "vitest";
import {
	insertAt,
	mergeOrder,
	placeAfter,
	renameInOrder,
	reorder,
	variantBase,
	withFrameOrder,
	without,
	withoutPageOrder,
	withPageOrder,
} from "./order";

describe("order merge", () => {
	it("keeps the stored arrangement and drops names the projection no longer has", () => {
		expect(mergeOrder(["shell", "home", "gone"], ["home", "shell"])).toEqual(["shell", "home"]);
	});

	it("stands in for the projection when nothing is stored", () => {
		expect(mergeOrder(undefined, ["home", "shell"])).toEqual(["home", "shell"]);
		expect(mergeOrder([], ["home", "shell"])).toEqual(["home", "shell"]);
	});

	it("lands a new variant directly after its base rather than at its letter", () => {
		expect(mergeOrder(["zebra", "home"], ["zebra", "home", "home--dark"])).toEqual(["zebra", "home", "home--dark"]);
	});

	it("keeps a base's variants in order among themselves", () => {
		const stored = ["home", "home--dark", "home--empty"];
		expect(mergeOrder(stored, [...stored, "home--wide"])).toEqual([...stored, "home--wide"]);
		expect(mergeOrder(stored, [...stored, "home--alpha"])).toEqual([
			"home",
			"home--alpha",
			"home--dark",
			"home--empty",
		]);
	});

	it("inserts any other new name at its alphabetical spot", () => {
		expect(mergeOrder(["alpha", "gamma"], ["alpha", "beta", "gamma"])).toEqual(["alpha", "beta", "gamma"]);
		expect(mergeOrder(["alpha", "gamma"], ["alpha", "gamma", "zulu"])).toEqual(["alpha", "gamma", "zulu"]);
	});

	it("falls back to the alphabetical spot when a variant's base is not on the list", () => {
		expect(mergeOrder(["alpha", "zulu"], ["alpha", "zulu", "home--dark"])).toEqual(["alpha", "home--dark", "zulu"]);
	});

	it("answers with a permutation of the projection, whatever the file said", () => {
		const merged = mergeOrder(["shell", "shell", "ghost"], ["home", "shell", "cart"]);
		expect([...merged].sort()).toEqual(["cart", "home", "shell"]);
	});

	it("reads a leading -- as an ordinary name rather than a variant of nothing", () => {
		expect(variantBase("--dock")).toBeUndefined();
		expect(variantBase("home")).toBeUndefined();
		expect(variantBase("home--dark")).toBe("home");
	});
});

describe("a drop inside one list", () => {
	const list = ["a", "b", "c", "d"];

	it("moves one name to the gap it was dropped in", () => {
		expect(reorder(list, ["a"], 3)).toEqual(["b", "c", "a", "d"]);
		expect(reorder(list, ["d"], 1)).toEqual(["a", "d", "b", "c"]);
	});

	it("moves a multi-selection as one block, in list order", () => {
		expect(reorder(list, ["c", "a"], 4)).toEqual(["b", "d", "a", "c"]);
	});

	it("leaves the list alone when the block is dropped where it already is", () => {
		expect(reorder(list, ["b"], 1)).toEqual(list);
		expect(reorder(list, ["b"], 2)).toEqual(list);
	});
});

describe("a drop into another list", () => {
	it("inserts names the list does not hold yet", () => {
		expect(insertAt(["a", "b"], ["x"], 1)).toEqual(["a", "x", "b"]);
		expect(insertAt(["a", "b"], ["x", "y"], 2)).toEqual(["a", "b", "x", "y"]);
	});

	it("never lands a name twice, and clamps an index past either end", () => {
		expect(insertAt(["a", "b"], ["a", "x"], 0)).toEqual(["x", "a", "b"]);
		expect(insertAt(["a"], ["x"], 99)).toEqual(["a", "x"]);
	});

	it("takes names out of the list they left", () => {
		expect(without(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
	});
});

describe("names that change or arrive", () => {
	it("keeps a renamed frame exactly where it was", () => {
		expect(renameInOrder(["a", "b", "c"], "b", "z")).toEqual(["a", "z", "c"]);
	});

	it("lands copies beside what they were made from", () => {
		expect(placeAfter(["a", "b"], "a", ["a-copy"])).toEqual(["a", "a-copy", "b"]);
		expect(placeAfter(["a", "b"], "ghost", ["x"])).toEqual(["a", "b", "x"]);
	});
});

describe("what a write says about the rest of the file", () => {
	const stored = { pages: ["shop", "admin"], frames: { shop: ["cart"], admin: ["users"] } };

	it("states one list and carries every other one through", () => {
		expect(withFrameOrder(stored, "shop", ["cart", "checkout"])).toEqual({
			pages: ["shop", "admin"],
			frames: { shop: ["cart", "checkout"], admin: ["users"] },
		});
		expect(withPageOrder(stored, ["admin", "shop"])).toEqual({
			pages: ["admin", "shop"],
			frames: { shop: ["cart"], admin: ["users"] },
		});
	});

	it("takes a trashed page's row and its frame list together", () => {
		expect(withoutPageOrder(stored, "shop")).toEqual({ pages: ["admin"], frames: { admin: ["users"] } });
	});
});
