import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { type HeadlessShell, HeadlessShellCannotRunError, missingLibrary } from "../headless-shell";
import { makeApp, makeProject, makeTempDir, sseReader, writeFrame } from "../test-helpers";
import {
	type BoothDeps,
	type BoothReason,
	createBooth,
	createBoothQueue,
	followsColorScheme,
	type Sitting,
	systemColorScheme,
} from "./booth";

const ROOT = "/projects/shop";
const OTHER = "/projects/blog";

const sitting = (frame: string, reason: BoothReason = "missing", root = ROOT): Sitting => ({
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
		queue.add(sitting("checkout"));
		queue.add(sitting("checkout"));
		queue.add(sitting("checkout", "edited"));
		expect(queue.waiting).toBe(1);
		expect(drain(queue)).toEqual(["checkout:edited"]);
	});

	it("tells the same frame name in two projects apart", () => {
		const queue = createBoothQueue();
		queue.add(sitting("home"));
		queue.add(sitting("home", "missing", OTHER));
		expect(queue.waiting).toBe(2);
	});

	it("takes what is waiting in the order it arrived when nothing else tells them apart", () => {
		const queue = createBoothQueue();
		for (const frame of ["a", "b", "c"]) queue.add(sitting(frame));
		expect(drain(queue)).toEqual(["a:missing", "b:missing", "c:missing"]);
	});

	it("puts an edit ahead of a stale picture, and a stale picture ahead of a missing one", () => {
		const queue = createBoothQueue();
		queue.add(sitting("missing"));
		queue.add(sitting("stale", "stale"));
		queue.add(sitting("edited", "edited"));
		expect(drain(queue)).toEqual(["edited:edited", "stale:stale", "missing:missing"]);
	});

	it("never lowers what a frame is owed", () => {
		const queue = createBoothQueue();
		queue.add(sitting("checkout", "edited"));
		queue.add(sitting("checkout", "missing"));
		queue.add(sitting("checkout", "stale"));
		expect(drain(queue)).toEqual(["checkout:edited"]);
	});

	it("takes the frames on screen first, then the rest of the open page, then everything else", () => {
		const queue = createBoothQueue();
		queue.add(sitting("elsewhere/one", "edited"));
		queue.add(sitting("shop/aside"));
		queue.add(sitting("shop/visible"));
		queue.add(sitting("loose"));
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
		queue.add(sitting("shop/checkout"));
		queue.add(sitting("home"));
		queue.view("canvas", { root: ROOT, page: "", frames: [] });
		expect(queue.placeOf(ROOT, "home")).toBe("on an open page");
		expect(queue.placeOf(ROOT, "shop/checkout")).toBe("elsewhere");
		expect(drain(queue)).toEqual(["home:missing", "shop/checkout:missing"]);
	});

	it("orders by where the canvas rests now, not where it was when the work arrived", () => {
		const queue = createBoothQueue();
		queue.add(sitting("left"));
		queue.add(sitting("right"));
		queue.view("canvas", { root: ROOT, page: "", frames: ["left"] });
		queue.view("canvas", { root: ROOT, page: "", frames: ["right"] });
		expect(queue.take()?.frame).toBe("right");
	});

	it("counts a view only for its own project, and forgets it when the canvas goes", () => {
		const queue = createBoothQueue();
		queue.view("canvas", { root: OTHER, page: "", frames: ["home"] });
		expect(queue.placeOf(ROOT, "home")).toBe("elsewhere");
		expect(queue.placeOf(OTHER, "home")).toBe("on screen");
		queue.view("canvas", undefined);
		expect(queue.placeOf(OTHER, "home")).toBe("elsewhere");
	});

	it("takes the best place any open canvas gives a frame", () => {
		const queue = createBoothQueue();
		queue.view("one", { root: ROOT, page: "shop", frames: [] });
		queue.view("two", { root: ROOT, page: "shop", frames: ["shop/checkout"] });
		expect(queue.placeOf(ROOT, "shop/checkout")).toBe("on screen");
		expect(queue.placeOf(ROOT, "shop/cart")).toBe("on an open page");
	});

	it("photographs a frame edited while it was in a tab once more when the tab is free", () => {
		const queue = createBoothQueue();
		queue.add(sitting("checkout", "missing"));
		const inTab = queue.take();
		expect(inTab?.frame).toBe("checkout");
		// the write lands while the tab is photographing the old source
		queue.add(sitting("checkout", "edited"));
		queue.add(sitting("checkout", "edited"));
		expect(queue.waiting).toBe(0);
		expect(queue.take()).toBeUndefined();
		expect(queue.release(sitting("checkout"))).toBe(true);
		expect(drain(queue)).toEqual(["checkout:edited"]);
	});

	it("does not photograph a frame twice because a read found it uncovered while it was in a tab", () => {
		const queue = createBoothQueue();
		queue.add(sitting("checkout"));
		const inTab = queue.take();
		queue.add(sitting("checkout", "missing"));
		expect(queue.release(sitting(inTab?.frame ?? ""))).toBe(false);
		expect(queue.waiting).toBe(0);
	});

	it("never hands out a frame that is already in a tab", () => {
		const queue = createBoothQueue();
		queue.add(sitting("a"));
		queue.add(sitting("b"));
		expect(queue.take()?.frame).toBe("a");
		expect(queue.take()?.frame).toBe("b");
		expect(queue.take()).toBeUndefined();
		expect(queue.busy).toBe(2);
	});

	it("owes nothing for a frame that left, waiting or in a tab", () => {
		const queue = createBoothQueue();
		queue.add(sitting("gone"));
		queue.add(sitting("going"));
		queue.drop(ROOT, "gone");
		const inTab = queue.take();
		expect(inTab?.frame).toBe("going");
		queue.add(sitting("going", "edited"));
		queue.drop(ROOT, "going");
		expect(queue.release(sitting("going"))).toBe(false);
		expect(queue.waiting).toBe(0);
	});

	it("forgets everything a project was owed, and its canvases, when it leaves the registry", () => {
		const queue = createBoothQueue();
		queue.add(sitting("home"));
		queue.add(sitting("home", "missing", OTHER));
		queue.view("canvas", { root: ROOT, page: "", frames: ["home"] });
		queue.dropProject(ROOT);
		expect(queue.waiting).toBe(1);
		expect(queue.placeOf(ROOT, "home")).toBe("elsewhere");
		expect(queue.take()?.root).toBe(OTHER);
	});

	it("puts a sitting the browser never finished back in line as it was, edits that came in meanwhile kept", () => {
		const queue = createBoothQueue();
		queue.add(sitting("checkout", "missing"));
		const inTab = queue.take();
		queue.add(sitting("checkout", "edited"));
		queue.putBack(inTab ?? sitting("checkout"));
		expect(queue.busy).toBe(0);
		expect(drain(queue)).toEqual(["checkout:edited"]);
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

	it("does not count a module that only carries the words as data", () => {
		// Spool's own canvas bundles a list of Tailwind variants into hundreds of frames
		expect(
			followsColorScheme('<script type="module">const when = "@media (prefers-color-scheme: dark)";</script>'),
		).toBe(false);
		expect(followsColorScheme('<script type="module">const css = "color-scheme: light dark";</script>')).toBe(false);
	});

	it("leaves a frame that settles on one scheme alone", () => {
		expect(followsColorScheme("<style>:root{color-scheme:dark}</style><main>night</main>")).toBe(false);
		expect(followsColorScheme("<style>:root{color-scheme: light}</style>")).toBe(false);
		expect(followsColorScheme("<main>plain</main>")).toBe(false);
	});
});

/**
 * The booth's decisions that need no browser: what it refuses before it would
 * launch one. A launch here is a failure of the test, because each of these is
 * a browser started for nothing.
 */
describe("the booth before any browser", () => {
	function booth(overrides: Partial<BoothDeps> = {}) {
		const deps = {
			origin: () => "http://run.spool.localhost:1",
			compile: vi.fn<BoothDeps["compile"]>(async () => ({ kind: "ok", etag: '"one"', document: "<main></main>" })),
			geometry: vi.fn(() => ({ w: 390, h: 844 })),
			covered: vi.fn(() => false),
			registered: vi.fn(() => true),
			store: vi.fn(),
			failed: vi.fn(),
			finished: vi.fn(),
			launch: vi.fn<NonNullable<BoothDeps["launch"]>>(async () => {
				throw new Error("no browser in this test");
			}),
			systemScheme: vi.fn(async () => "light" as const),
			log: vi.fn(),
			...overrides,
		};
		const made = createBooth(createBoothQueue(), deps);
		onTestFinished(() => made.close());
		return { booth: made, deps };
	}

	it("refuses a frame past the raster budget with a reason, without a browser", async () => {
		const { booth: made, deps } = booth({ geometry: vi.fn(() => ({ w: 100, h: 50_000 })) });
		made.enqueue(sitting("tall"));
		await vi.waitFor(() => expect(deps.failed).toHaveBeenCalledWith(ROOT, "tall", "too large for a cover"));
		expect(deps.launch).not.toHaveBeenCalled();
		expect(deps.store).not.toHaveBeenCalled();
	});

	it("does not spend a picture on a frame whose missing cover turned up while it waited", async () => {
		const { booth: made, deps } = booth({ covered: vi.fn(() => true) });
		made.enqueue(sitting("home", "missing"));
		await vi.waitFor(() => expect(deps.finished).toHaveBeenCalledWith(ROOT, "home"));
		expect(deps.compile).not.toHaveBeenCalled();
		expect(deps.launch).not.toHaveBeenCalled();
	});

	it("keeps a broken compile's reason beside the old cover, and lets only an edit ask again soon", async () => {
		const { booth: made, deps } = booth({
			compile: vi.fn<BoothDeps["compile"]>(async () => ({ kind: "error", message: "Unexpected end of file" })),
		});
		made.enqueue(sitting("broken", "missing"));
		await vi.waitFor(() => expect(deps.failed).toHaveBeenCalledWith(ROOT, "broken", "Unexpected end of file"));
		// every projection read finds it uncovered; none of them is a reason to try again
		made.enqueue(sitting("broken", "missing"));
		made.enqueue(sitting("broken", "missing"));
		await new Promise((done) => setTimeout(done, 20));
		expect(deps.compile).toHaveBeenCalledTimes(1);
		// an edit is the thing that can fix it
		made.enqueue(sitting("broken", "edited"));
		await vi.waitFor(() => expect(deps.compile).toHaveBeenCalledTimes(2));
		expect(deps.store).not.toHaveBeenCalled();
		expect(deps.launch).not.toHaveBeenCalled();
	});

	it("owes nothing for a frame that is gone by the time a tab is free", async () => {
		const { booth: made, deps } = booth({ compile: vi.fn<BoothDeps["compile"]>(async () => ({ kind: "missing" })) });
		made.enqueue(sitting("gone", "edited"));
		await vi.waitFor(() => expect(deps.finished).toHaveBeenCalledWith(ROOT, "gone"));
		expect(deps.failed).not.toHaveBeenCalled();
		expect(deps.launch).not.toHaveBeenCalled();
	});

	it("blames a browser that will not start on the browser, never on the frame", async () => {
		const { booth: made, deps } = booth();
		made.enqueue(sitting("home", "edited"));
		await vi.waitFor(() =>
			expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("could not start a browser")),
		);
		expect(deps.launch).toHaveBeenCalledTimes(1);
		expect(deps.failed).not.toHaveBeenCalled();
		// and does not try again on the next edit: a browser that would not start
		// a moment ago will not start now
		made.enqueue(sitting("other", "edited"));
		await new Promise((done) => setTimeout(done, 20));
		expect(deps.launch).toHaveBeenCalledTimes(1);
	});

	it("tries a browser that would not start again once the wait is over, with nothing new asking", async () => {
		const { booth: made, deps } = booth({ timing: { relaunchAfterMs: 300 } });
		made.enqueue(sitting("home", "edited"));
		await vi.waitFor(() => expect(deps.launch).toHaveBeenCalled());
		await new Promise((done) => setTimeout(done, 100));
		expect(deps.launch).toHaveBeenCalledTimes(1);
		// the frame is still owed, and the retry is the booth's own to make
		await vi.waitFor(() => expect(deps.launch).toHaveBeenCalledTimes(2), { timeout: 2000 });
		expect(deps.failed).not.toHaveBeenCalled();
	});

	it("says a browser that keeps failing to start once, however often it tries again", async () => {
		const { booth: made, deps } = booth({ timing: { relaunchAfterMs: 30 } });
		made.enqueue(sitting("home", "edited"));
		await vi.waitFor(() => expect(deps.launch).toHaveBeenCalledTimes(4), { timeout: 2000 });
		expect(deps.log).toHaveBeenCalledTimes(1);
		expect(deps.log).toHaveBeenCalledWith("the photo booth could not start a browser: no browser in this test");
	});

	it("stops trying a browser this machine cannot run, says what to install once, and still lets a shot try", async () => {
		const { booth: made, deps } = booth({
			timing: { relaunchAfterMs: 30 },
			launch: vi.fn<NonNullable<BoothDeps["launch"]>>(async () => {
				throw new HeadlessShellCannotRunError("libatk-1.0.so.0");
			}),
		});
		made.enqueue(sitting("home", "edited"));
		await vi.waitFor(() => expect(deps.log).toHaveBeenCalled());
		// a minute's wait changes nothing on a machine missing libraries: no retry of its own
		await new Promise((done) => setTimeout(done, 200));
		expect(deps.launch).toHaveBeenCalledTimes(1);
		expect(deps.log).toHaveBeenCalledTimes(1);
		const line = String(vi.mocked(deps.log).mock.calls[0]?.[0]);
		expect(line).toMatch(/^the photo booth could not start a browser: this machine is missing libatk-1\.0\.so\.0/u);
		expect(line).toMatch(/`npx playwright-core@[\d.]+ install-deps chromium-headless-shell`/u);
		expect(deps.failed).not.toHaveBeenCalled();
		// somebody asking for a shot is worth one more try, and hears why it failed
		await expect(
			made.shoot({ project: "shop", frame: "home", width: 10, height: 10, scale: 1, tiles: [{ y: 0, height: 10 }] }),
		).rejects.toThrow("install-deps chromium-headless-shell");
		expect(deps.launch).toHaveBeenCalledTimes(2);
		expect(deps.log).toHaveBeenCalledTimes(1);
	});

	it("gives a browser that does not answer a deadline, tells the shot why, and ends it if it answers late", async () => {
		let started: (shell: HeadlessShell) => void = () => {};
		const { booth: made } = booth({
			launch: vi.fn<NonNullable<BoothDeps["launch"]>>(
				() =>
					new Promise((done) => {
						started = done;
					}),
			),
			timing: { launchMs: 1000 },
		});
		await expect(
			made.shoot({ project: "shop", frame: "home", width: 10, height: 10, scale: 1, tiles: [{ y: 0, height: 10 }] }),
		).rejects.toThrow("the browser did not start within 1 s");
		const late = {
			browser: {} as HeadlessShell["browser"],
			close: vi.fn(async () => {}),
			kill: vi.fn(async () => {}),
		};
		started(late);
		await vi.waitFor(() => expect(late.kill).toHaveBeenCalled());
	});

	it("tells a waiting shot the browser would not start", async () => {
		const { booth: made } = booth();
		await expect(
			made.shoot({ project: "shop", frame: "home", width: 10, height: 10, scale: 1, tiles: [{ y: 0, height: 10 }] }),
		).rejects.toThrow("no browser in this test");
	});
});

describe("the colour scheme the booth starts in", () => {
	const quiet = {
		origin: () => undefined,
		compile: async () => ({ kind: "missing" }) as const,
		geometry: () => ({ w: 390, h: 844 }),
		covered: () => false,
		registered: () => true,
		store: () => {},
		failed: () => {},
	};

	it("is the machine's until a canvas says otherwise", async () => {
		const made = createBooth(createBoothQueue(), { ...quiet, systemScheme: async () => "dark" });
		onTestFinished(() => made.close());
		await made.schemeKnown();
		expect(made.scheme).toBe("dark");
		expect(made.setScheme("dark")).toBe(false);
		expect(made.setScheme("light")).toBe(true);
	});

	it("gives way to a canvas that spoke before the machine answered", async () => {
		let answer: (scheme: "dark") => void = () => {};
		const made = createBooth(createBoothQueue(), {
			...quiet,
			systemScheme: () =>
				new Promise((done) => {
					answer = done;
				}),
		});
		onTestFinished(() => made.close());
		const known = made.schemeKnown();
		made.setScheme("light");
		answer("dark");
		await known;
		expect(made.scheme).toBe("light");
	});

	it("is light anywhere the machine has no say", async () => {
		expect(await systemColorScheme("linux")).toBe("light");
	});
});

describe("two canvases in different schemes", () => {
	it("move the booth only when one of them changes its own, so panning either trades nothing", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "home", "export default function Frame() { return <main>home</main>; }\n");
		const app = makeApp(spoolDir, {
			booth: {
				systemScheme: async () => "light",
				launch: async () => {
					throw new Error("no browser in this test");
				},
			},
		});
		const scheme = async () =>
			((await (await app.request(`/api/p/${name}/verify/home`)).json()) as { scheme: string }).scheme;
		const open = async () => {
			const controller = new AbortController();
			onTestFinished(() => controller.abort());
			const events = sseReader(await app.request(`/api/p/${name}/events`, { signal: controller.signal }));
			const hello = await events.next();
			const { view } = hello.data as { view: string };
			return (shows: "light" | "dark") =>
				app.request(`/api/p/${name}/view`, {
					method: "PUT",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ view, page: "", frames: ["home"], scheme: shows }),
				});
		};
		const one = await open();
		const two = await open();

		await one("dark");
		expect(await scheme()).toBe("dark");
		// the second canvas opens light: the newest thing anyone said
		await two("light");
		expect(await scheme()).toBe("light");
		// the first pans, still dark, and moves nothing; nor does the second
		await one("dark");
		await two("light");
		expect(await scheme()).toBe("light");
		// until the first goes over to light and back to dark itself
		await one("light");
		await one("dark");
		expect(await scheme()).toBe("dark");
	});
});

describe("a headless shell this machine cannot run", () => {
	it("is read from the loader's line in playwright's launch log", () => {
		const log = [
			"Protocol error (Browser.getVersion): Internal server error, session closed. Failed to launch browser.",
			"[pid=1][err] /cache/chrome-headless-shell: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file: No such file or directory",
		].join("\n");
		expect(missingLibrary(log)).toBe("libatk-1.0.so.0");
		expect(missingLibrary("Protocol error (Browser.getVersion): Internal server error, session closed.")).toBe(
			undefined,
		);
	});
});
