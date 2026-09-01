import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { ChangeEvent } from "./events";
import type { watchTree } from "./watch-tree";

/**
 * The watcher's own lifetime (#22), and what it makes of a path it is handed.
 *
 * Whether the OS really delivers a path is `watch-tree.test.ts`'s business,
 * against a real folder, and `app.test.ts`'s against a real stream. Here the
 * disk is the test: the tree watch is a mock, so a path arrives exactly when
 * the test says so and the two things a real folder cannot show — when the
 * handle is opened and let go, and what one named path means — are both plain.
 */

const tree = vi.hoisted(() => ({ watchTree: vi.fn() }));
const watcher = vi.hoisted(() => ({ close: vi.fn() }));

vi.mock(import("./watch-tree"), () => ({ watchTree: tree.watchTree as unknown as typeof watchTree }));
vi.mock(import("./design-path"), async (importOriginal) => ({
	...(await importOriginal()),
	realDesignDir: (root: string) => `${root}/design`,
}));

const { createChangeHub } = await import("./events");

/** The callback the hub handed the tree watch, so a test can be the disk. */
let onChange: ((filename: string | null) => void) | undefined;

tree.watchTree.mockImplementation((_dir: string, listener: typeof onChange) => {
	onChange = listener;
	return watcher;
});

afterEach(() => {
	vi.useRealTimers();
	tree.watchTree.mockClear();
	watcher.close.mockClear();
	onChange = undefined;
});

/**
 * A project on disk, because classification asks the folder whether a name is a
 * frame or a page: `frames/hello` is a frame and `frames/shop` is a page with
 * `cart` inside it, which is the two shapes every path below comes in.
 */
function project(): string {
	const root = mkdtempSync(join(tmpdir(), "spool-events-"));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	for (const dir of ["frames/hello", "frames/shop/cart", "frames/explorations/chat/agent-chat"]) {
		mkdirSync(join(root, "design", dir), { recursive: true });
		writeFileSync(join(root, "design", dir, "frame.tsx"), "export default () => null;\n");
	}
	return root;
}

describe("what a changed path means", () => {
	/** every event one batch of paths produced, once the debounce has run */
	async function landed(root: string, paths: string[]): Promise<ChangeEvent[]> {
		const hub = createChangeHub();
		const seen: ChangeEvent[] = [];
		hub.subscribe(root, (event) => seen.push(event));
		for (const path of paths) onChange?.(path);
		await vi.advanceTimersByTimeAsync(100);
		hub.close();
		return seen;
	}

	it("announces a sidecar write as a move of the frame it names, in both shapes (#113)", async () => {
		vi.useFakeTimers();
		const root = project();

		// an agent writing geometry is placing the frame, which is a thing an open
		// canvas has to hear — and never a reason to reload the document
		expect(await landed(root, ["frames/hello/frame.json"])).toEqual([{ kind: "geometry", frame: "hello" }]);
		// a frame inside a page sits one deeper, and the sidecar rule moves with it
		expect(await landed(root, ["frames/shop/cart/frame.json"])).toEqual([{ kind: "geometry", frame: "cart" }]);
	});

	it("keeps a source edit a source edit, whichever shape the frame is in", async () => {
		vi.useFakeTimers();
		const root = project();

		expect(await landed(root, ["frames/hello/frame.tsx"])).toEqual([{ kind: "frame", frame: "hello" }]);
		expect(await landed(root, ["frames/shop/cart/frame.tsx"])).toEqual([{ kind: "frame", frame: "cart" }]);
	});

	/**
	 * A page is a page at any depth (#231), so this walks the path down through
	 * the pages rather than counting segments — and what stops the walk is the
	 * frame, wherever that turns out to be.
	 */
	it("names the frame at the end of however many pages there are", async () => {
		vi.useFakeTimers();
		const root = project();
		const deep = "frames/explorations/chat/agent-chat";

		expect(await landed(root, [`${deep}/frame.tsx`])).toEqual([{ kind: "frame", frame: "agent-chat" }]);
		expect(await landed(root, [`${deep}/frame.json`])).toEqual([{ kind: "geometry", frame: "agent-chat" }]);
		// a file inside the frame's own folder is still that frame's edit
		expect(await landed(root, [`${deep}/parts/row.tsx`])).toEqual([{ kind: "frame", frame: "agent-chat" }]);
		// a page folder itself is a discovery change, named for the folder that moved
		expect(await landed(root, ["frames/explorations/chat"])).toEqual([{ kind: "frame", frame: "chat" }]);
	});

	/**
	 * A delete makes the path unreadable, and the folder it took looks exactly
	 * like a page that has nothing in it. Naming the folder that went is what
	 * keeps the walk from carrying on into what used to be inside it.
	 */
	it("names the frame that vanished rather than the file that was in it", async () => {
		vi.useFakeTimers();
		const root = project();
		rmSync(join(root, "design", "frames", "shop", "cart"), { recursive: true, force: true });

		expect(await landed(root, ["frames/shop/cart/frame.tsx"])).toEqual([{ kind: "frame", frame: "cart" }]);
	});

	it("carries a move and an edit to one frame as the two facts they are", async () => {
		vi.useFakeTimers();
		const root = project();

		// a resize writes both, inside one debounce window: the canvas has to move
		// the frame and reload it, and a single slot would lose one of them
		expect(await landed(root, ["frames/hello/frame.tsx", "frames/hello/frame.json"])).toEqual([
			{ kind: "frame", frame: "hello" },
			{ kind: "geometry", frame: "hello" },
		]);
	});

	it("still says nothing for the app's own state", async () => {
		vi.useFakeTimers();
		const root = project();

		expect(await landed(root, [".spool/thumbs/hello/cover.png", "canvas.json"])).toEqual([]);
	});
});

describe("how long a watcher outlives its last subscriber", () => {
	it("keeps the handle for a stream that comes back, and feeds it what lands after", async () => {
		vi.useFakeTimers();
		const hub = createChangeHub();
		const unsubscribe = hub.subscribe("/project", () => {});
		expect(tree.watchTree).toHaveBeenCalledTimes(1);

		// the browser's connection dropped: it is gone for its backoff, and the
		// disk is not watching itself in the meantime
		unsubscribe();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(watcher.close).not.toHaveBeenCalled();

		const seen: ChangeEvent[] = [];
		hub.subscribe("/project", (event) => seen.push(event));
		expect(tree.watchTree).toHaveBeenCalledTimes(1);

		// no fresh watcher means no fresh arming window: the first edit after the
		// return is announced rather than dropped into it
		onChange?.("shared/tokens.css");
		await vi.advanceTimersByTimeAsync(100);
		expect(seen).toEqual([{ kind: "shared" }]);

		hub.close();
	});

	it("lets the handle go once nobody has come back", async () => {
		vi.useFakeTimers();
		const hub = createChangeHub();

		hub.subscribe("/project", () => {})();
		await vi.advanceTimersByTimeAsync(9_000);
		expect(watcher.close).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(2_000);
		expect(watcher.close).toHaveBeenCalledTimes(1);

		// and the next subscriber is watching a folder again, not a closed handle
		hub.subscribe("/project", () => {});
		expect(tree.watchTree).toHaveBeenCalledTimes(2);
		hub.close();
	});

	it("lets it go on close, whatever the window was doing", async () => {
		vi.useFakeTimers();
		const hub = createChangeHub();

		hub.subscribe("/project", () => {})();
		hub.close();

		expect(watcher.close).toHaveBeenCalledTimes(1);
		// the armed teardown went with it: nothing fires against a closed hub
		await vi.advanceTimersByTimeAsync(20_000);
		expect(watcher.close).toHaveBeenCalledTimes(1);
	});
});
