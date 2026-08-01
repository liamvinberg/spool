import { mkdirSync, mkdtempSync, rmSync, type watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { ChangeEvent } from "./events";

/**
 * The watcher's own lifetime (#22), and what it makes of a path it is handed.
 *
 * Whether the OS really delivers a path is `app.test.ts`'s business, against a
 * real folder and a real stream. Here the disk is the test: `fs.watch` is a
 * mock, so a path arrives exactly when the test says so and the two things a
 * real folder cannot show — when the handle is opened and let go, and what one
 * named path means — are both plain.
 */

const fs = vi.hoisted(() => ({ watch: vi.fn() }));
const watcher = vi.hoisted(() => ({ close: vi.fn(), on: vi.fn() }));

vi.mock(import("node:fs"), async (importOriginal) => ({
	...(await importOriginal()),
	watch: fs.watch as unknown as typeof watch,
}));
vi.mock(import("./design-path"), async (importOriginal) => ({
	...(await importOriginal()),
	realDesignDir: (root: string) => `${root}/design`,
}));

const { createChangeHub } = await import("./events");

/** The recursive callback the hub handed fs.watch, so a test can be the disk. */
let onChange: ((type: string, filename: string) => void) | undefined;

fs.watch.mockImplementation((_dir: string, _options: unknown, listener: typeof onChange) => {
	onChange = listener;
	return watcher;
});

afterEach(() => {
	vi.useRealTimers();
	fs.watch.mockClear();
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
	for (const dir of ["frames/hello", "frames/shop/cart"]) {
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
		for (const path of paths) onChange?.("change", path);
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
		expect(fs.watch).toHaveBeenCalledTimes(1);

		// the browser's connection dropped: it is gone for its backoff, and the
		// disk is not watching itself in the meantime
		unsubscribe();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(watcher.close).not.toHaveBeenCalled();

		const seen: ChangeEvent[] = [];
		hub.subscribe("/project", (event) => seen.push(event));
		expect(fs.watch).toHaveBeenCalledTimes(1);

		// no fresh watcher means no fresh arming window: the first edit after the
		// return is announced rather than dropped into it
		onChange?.("change", "shared/tokens.css");
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
		expect(fs.watch).toHaveBeenCalledTimes(2);
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
