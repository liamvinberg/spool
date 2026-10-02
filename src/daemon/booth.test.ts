import { describe, expect, it } from "vitest";
import { type BoothJob, type BoothReason, createBoothQueue, followsColorScheme } from "./booth";

const ROOT = "/projects/shop";
const OTHER = "/projects/blog";

const job = (frame: string, reason: BoothReason = "missing", root = ROOT): BoothJob => ({
	root,
	project: root.slice(root.lastIndexOf("/") + 1),
	frame,
	reason,
});

/** Everything the queue hands out, in order, each released as soon as it is taken. */
function drain(queue: ReturnType<typeof createBoothQueue>): string[] {
	const taken: string[] = [];
	for (let next = queue.take(); next !== undefined; next = queue.take()) {
		taken.push(`${next.frame}:${next.reason}`);
		queue.release(next);
	}
	return taken;
}

describe("the booth queue", () => {
	it("keeps one entry per frame, however many things ask for it", () => {
		const queue = createBoothQueue();
		queue.add(job("checkout"));
		queue.add(job("checkout"));
		queue.add(job("checkout", "edited"));
		expect(queue.waiting).toBe(1);
		expect(drain(queue)).toEqual(["checkout:edited"]);
	});

	it("tells the same frame name in two projects apart", () => {
		const queue = createBoothQueue();
		queue.add(job("home"));
		queue.add(job("home", "missing", OTHER));
		expect(queue.waiting).toBe(2);
	});

	it("takes what is waiting in the order it arrived when nothing else tells them apart", () => {
		const queue = createBoothQueue();
		for (const frame of ["a", "b", "c"]) queue.add(job(frame));
		expect(drain(queue)).toEqual(["a:missing", "b:missing", "c:missing"]);
	});

	it("puts an edit ahead of a stale picture, and a stale picture ahead of a missing one", () => {
		const queue = createBoothQueue();
		queue.add(job("missing"));
		queue.add(job("stale", "stale"));
		queue.add(job("edited", "edited"));
		expect(drain(queue)).toEqual(["edited:edited", "stale:stale", "missing:missing"]);
	});

	it("never lowers what a frame is owed", () => {
		const queue = createBoothQueue();
		queue.add(job("checkout", "edited"));
		queue.add(job("checkout", "missing"));
		queue.add(job("checkout", "stale"));
		expect(drain(queue)).toEqual(["checkout:edited"]);
	});

	it("takes the frames on screen first, then the rest of the open page, then everything else", () => {
		const queue = createBoothQueue();
		queue.add(job("elsewhere/one", "edited"));
		queue.add(job("shop/aside"));
		queue.add(job("shop/visible"));
		queue.add(job("loose"));
		queue.view("canvas", { root: ROOT, page: "shop", frames: ["shop/visible"] });
		// an edit nobody can see waits behind the page somebody is looking at
		expect(drain(queue)).toEqual([
			"shop/visible:missing",
			"shop/aside:missing",
			"elsewhere/one:edited",
			"loose:missing",
		]);
	});

	it("reads the root page as the frames with no page of their own", () => {
		const queue = createBoothQueue();
		queue.add(job("shop/checkout"));
		queue.add(job("home"));
		queue.view("canvas", { root: ROOT, page: "", frames: [] });
		expect(queue.placeOf(ROOT, "home")).toBe(1);
		expect(queue.placeOf(ROOT, "shop/checkout")).toBe(2);
		expect(drain(queue)).toEqual(["home:missing", "shop/checkout:missing"]);
	});

	it("orders by where the canvas rests now, not where it was when the work arrived", () => {
		const queue = createBoothQueue();
		queue.add(job("left"));
		queue.add(job("right"));
		queue.view("canvas", { root: ROOT, page: "", frames: ["left"] });
		queue.view("canvas", { root: ROOT, page: "", frames: ["right"] });
		expect(queue.take()?.frame).toBe("right");
	});

	it("counts a view only for its own project, and forgets it when the canvas goes", () => {
		const queue = createBoothQueue();
		queue.view("canvas", { root: OTHER, page: "", frames: ["home"] });
		expect(queue.placeOf(ROOT, "home")).toBe(2);
		expect(queue.placeOf(OTHER, "home")).toBe(0);
		queue.view("canvas", undefined);
		expect(queue.placeOf(OTHER, "home")).toBe(2);
	});

	it("takes the best place any open canvas gives a frame", () => {
		const queue = createBoothQueue();
		queue.view("one", { root: ROOT, page: "shop", frames: [] });
		queue.view("two", { root: ROOT, page: "shop", frames: ["shop/checkout"] });
		expect(queue.placeOf(ROOT, "shop/checkout")).toBe(0);
		expect(queue.placeOf(ROOT, "shop/cart")).toBe(1);
	});

	it("photographs a frame edited while it was in a tab once more when the tab is free", () => {
		const queue = createBoothQueue();
		queue.add(job("checkout", "missing"));
		const inTab = queue.take();
		expect(inTab?.frame).toBe("checkout");
		// the write lands while the tab is photographing the old source
		queue.add(job("checkout", "edited"));
		queue.add(job("checkout", "edited"));
		expect(queue.waiting).toBe(0);
		expect(queue.take()).toBeUndefined();
		expect(queue.release(job("checkout"))).toBe(true);
		expect(drain(queue)).toEqual(["checkout:edited"]);
	});

	it("does not photograph a frame twice because a read found it uncovered while it was in a tab", () => {
		const queue = createBoothQueue();
		queue.add(job("checkout"));
		const inTab = queue.take();
		queue.add(job("checkout", "missing"));
		expect(queue.release(job(inTab?.frame ?? ""))).toBe(false);
		expect(queue.waiting).toBe(0);
	});

	it("never hands out a frame that is already in a tab", () => {
		const queue = createBoothQueue();
		queue.add(job("a"));
		queue.add(job("b"));
		expect(queue.take()?.frame).toBe("a");
		expect(queue.take()?.frame).toBe("b");
		expect(queue.take()).toBeUndefined();
		expect(queue.busy).toBe(2);
	});

	it("owes nothing for a frame that left, waiting or in a tab", () => {
		const queue = createBoothQueue();
		queue.add(job("gone"));
		queue.add(job("going"));
		queue.drop(ROOT, "gone");
		const inTab = queue.take();
		expect(inTab?.frame).toBe("going");
		queue.add(job("going", "edited"));
		queue.drop(ROOT, "going");
		expect(queue.release(job("going"))).toBe(false);
		expect(queue.waiting).toBe(0);
	});

	it("forgets everything a project was owed, and its canvases, when it leaves the registry", () => {
		const queue = createBoothQueue();
		queue.add(job("home"));
		queue.add(job("home", "missing", OTHER));
		queue.view("canvas", { root: ROOT, page: "", frames: ["home"] });
		queue.dropProject(ROOT);
		expect(queue.waiting).toBe(1);
		expect(queue.placeOf(ROOT, "home")).toBe(2);
		expect(queue.take()?.root).toBe(OTHER);
	});
});

describe("whether a picture follows the colour scheme", () => {
	it("reads a prefers-color-scheme query, in a stylesheet or in code", () => {
		expect(followsColorScheme("<style>@media (prefers-color-scheme: dark){body{color:#fff}}</style>")).toBe(true);
		expect(followsColorScheme('<script>matchMedia("(prefers-color-scheme: dark)")</script>')).toBe(true);
	});

	it("reads a color-scheme that leaves the choice to the browser", () => {
		expect(followsColorScheme("<style>:root{color-scheme:light dark}</style>")).toBe(true);
		expect(followsColorScheme("<style>:root{color-scheme: dark light;}</style>")).toBe(true);
		expect(followsColorScheme('<meta name="color-scheme" content="light dark">')).toBe(true);
	});

	it("leaves a frame that settles on one scheme alone", () => {
		expect(followsColorScheme("<style>:root{color-scheme:dark}</style><main>night</main>")).toBe(false);
		expect(followsColorScheme("<style>:root{color-scheme: light}</style>")).toBe(false);
		expect(followsColorScheme("<main>plain</main>")).toBe(false);
	});
});
