import type { SpawnOptions } from "node:child_process";
import { describe, expect, it } from "vitest";
import { openInBrowser, shouldOpenBrowser } from "./browser";

/** Records a launch instead of performing one — no browser opens in a test run. */
function recorder() {
	const calls: { command: string; args: readonly string[]; options: SpawnOptions }[] = [];
	let unreffed = false;
	return {
		calls,
		unreffed: () => unreffed,
		launcher: (command: string, args: readonly string[], options: SpawnOptions) => {
			calls.push({ command, args, options });
			return {
				on: () => undefined,
				unref: () => {
					unreffed = true;
				},
			};
		},
	};
}

describe("openInBrowser", () => {
	it.each([
		["darwin", ["open", ["http://127.0.0.1:7766/p/shop"]]],
		["linux", ["xdg-open", ["http://127.0.0.1:7766/p/shop"]]],
		["win32", ["cmd", ["/c", "start", "", "http://127.0.0.1:7766/p/shop"]]],
	] as const)("asks %s to open the url with whatever the person browses in", (platform, expected) => {
		const spawned = recorder();

		openInBrowser("http://127.0.0.1:7766/p/shop", { platform, launcher: spawned.launcher });

		expect(spawned.calls).toHaveLength(1);
		expect([spawned.calls[0]?.command, spawned.calls[0]?.args]).toEqual(expected);
	});

	/*
	 * The CLI has printed the url and is done. A browser that inherited its
	 * streams could write over that line, and a child this process still waited
	 * on would keep the terminal.
	 */
	it("lets go: detached, every stream ignored, unreffed", () => {
		const spawned = recorder();

		openInBrowser("http://127.0.0.1:7766/p/shop", { platform: "linux", launcher: spawned.launcher });

		expect(spawned.calls[0]?.options).toMatchObject({ detached: true, stdio: "ignore" });
		expect(spawned.unreffed()).toBe(true);
	});

	/*
	 * A machine with no opener installed is not a failed command: the url is
	 * already on screen, which is the whole of what the person needs.
	 */
	it("stays quiet when the platform has no opener", () => {
		const errors: ((error: Error) => void)[] = [];
		const launcher = () => ({
			on: (_event: "error", listener: (error: Error) => void) => errors.push(listener),
			unref: () => undefined,
		});

		openInBrowser("http://127.0.0.1:7766/p/shop", { platform: "linux", launcher });

		expect(errors).toHaveLength(1);
		expect(() => errors[0]?.(new Error("spawn xdg-open ENOENT"))).not.toThrow();
	});
});

describe("shouldOpenBrowser", () => {
	it("opens for a person at a terminal", () => {
		expect(shouldOpenBrowser({ noOpen: false, stdin: { isTTY: true } })).toBe(true);
	});

	/*
	 * An agent or a script running `spool` gets exactly the old behavior: the
	 * url printed, no browser. Storybook shipped this unguarded and is walking
	 * it back because agents pop browsers on people.
	 */
	it("opens nothing when stdin is not a terminal", () => {
		expect(shouldOpenBrowser({ noOpen: false, stdin: {} })).toBe(false);
		expect(shouldOpenBrowser({ noOpen: false, stdin: { isTTY: false } })).toBe(false);
	});

	it("opens nothing when the person said not to", () => {
		expect(shouldOpenBrowser({ noOpen: true, stdin: { isTTY: true } })).toBe(false);
	});
});
