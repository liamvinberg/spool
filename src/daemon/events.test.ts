import type { watch } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChangeEvent } from "./events";

/**
 * The watcher's own lifetime (#22). What it watches and how it classifies a
 * path is `app.test.ts`'s business, against a real design/ folder; this is
 * about the one thing a real folder cannot show, which is when the handle is
 * opened and when it is let go.
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
