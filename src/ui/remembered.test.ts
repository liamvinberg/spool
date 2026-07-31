// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { keep, recall, useRemembered } from "./remembered";

/**
 * What survives a reload, and what is thrown away instead of being repaired.
 *
 * The claim under test is the hard one rather than the happy path: a stored value that is
 * not what its key means today is **deleted**, and the caller gets its own default. There is
 * no migration here and there is not meant to be one, so the tests that matter are the ones
 * asserting that nothing is salvaged.
 */

const isWidth = (value: unknown): value is number => typeof value === "number" && value > 0;

/**
 * A store of this test's own, rather than whatever the environment hands back.
 *
 * happy-dom has a `localStorage`, but a runtime carrying its own global shadows it and reads
 * back `undefined` instead. That second shape is worth naming: it is what a browser refusing
 * storage looks like, and it is how the `?? null` guard in `store()` earned its place — an
 * undefined store walks straight through a `=== null` test. Installing one here means these
 * tests assert the same thing whichever runtime they run on.
 */
function memoryStore(): Storage {
	const held = new Map<string, string>();
	return {
		get length() {
			return held.size;
		},
		clear: () => held.clear(),
		getItem: (key: string) => held.get(key) ?? null,
		key: (index: number) => [...held.keys()][index] ?? null,
		removeItem: (key: string) => void held.delete(key),
		setItem: (key: string, value: string) => void held.set(key, value),
	};
}

const install = (value: Storage | undefined) =>
	Object.defineProperty(window, "localStorage", { value, configurable: true, writable: true });

beforeEach(() => install(memoryStore()));
afterEach(() => vi.useRealTimers());

/** what is actually on disk, under the one namespace every key here lives in */
const raw = (key: string) => window.localStorage.getItem(`spool.${key}`);

function render(node: ReturnType<typeof createElement>): void {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	act(() => root.render(node));
}

describe("reading what was written", () => {
	it("is nothing when nothing was written", () => {
		expect(recall("rail.agent.width", isWidth)).toBeNull();
	});

	it("is the value, through the namespace", () => {
		keep("rail.agent.width", 320);

		expect(raw("rail.agent.width")).toBe("320");
		expect(recall("rail.agent.width", isWidth)).toBe(320);
	});

	/** it will never become readable, so it goes rather than being stepped over every read */
	it("deletes what cannot be parsed rather than stepping over it", () => {
		window.localStorage.setItem("spool.rail.agent.width", "{not json");

		expect(recall("rail.agent.width", isWidth)).toBeNull();
		expect(raw("rail.agent.width")).toBeNull();
	});

	/** the whole hard-cut claim: an old shape is not translated into the new one */
	it("deletes a readable value the guard rejects, and translates nothing", () => {
		window.localStorage.setItem("spool.rail.agent.width", JSON.stringify({ width: 320, collapsed: false }));

		expect(recall("rail.agent.width", isWidth)).toBeNull();
		expect(raw("rail.agent.width")).toBeNull();
	});

	it("holds keys apart, so one rail's width is not another's", () => {
		keep("rail.agent.width", 420);
		keep("rail.pages.width", 248);

		expect(recall("rail.agent.width", isWidth)).toBe(420);
		expect(recall("rail.pages.width", isWidth)).toBe(248);
	});

	/**
	 * A browser that cannot remember is not an error to report, it is a browser where every
	 * caller uses its own default for the life of the tab. Private windows throw on the read
	 * and bare environments have no store at all; both arrive here.
	 */
	it("says nothing and breaks nothing when the browser has no store", () => {
		install(undefined);

		expect(recall("rail.agent.width", isWidth)).toBeNull();
		expect(() => keep("rail.agent.width", 420)).not.toThrow();
	});

	it("says nothing and breaks nothing when the browser refuses one", () => {
		Object.defineProperty(window, "localStorage", {
			configurable: true,
			get() {
				throw new Error("access denied");
			},
		});

		expect(recall("rail.agent.width", isWidth)).toBeNull();
		expect(() => keep("rail.agent.width", 420)).not.toThrow();
	});
});

describe("a remembered value in a component", () => {
	const Box = ({ set }: { set: number | null }) => {
		const [width, setWidth] = useRemembered("rail.agent.width", 420, isWidth);
		return createElement(
			"button",
			{ type: "button", onClick: () => (set === null ? undefined : setWidth(set)) },
			String(width),
		);
	};

	it("starts at what was written down", () => {
		keep("rail.agent.width", 300);
		render(createElement(Box, { set: null }));

		expect(document.querySelector("button")?.textContent).toBe("300");
	});

	it("starts at its own default when the browser remembers nothing", () => {
		render(createElement(Box, { set: null }));

		expect(document.querySelector("button")?.textContent).toBe("420");
	});

	/**
	 * A default nobody has touched is not a preference. Writing it would freeze today's
	 * number into every browser that ever opened the app, so changing the default in the
	 * source would stop reaching anyone.
	 */
	it("writes nothing at all for a default nobody changed", () => {
		vi.useFakeTimers();
		render(createElement(Box, { set: null }));
		act(() => vi.advanceTimersByTime(2000));

		expect(raw("rail.agent.width")).toBeNull();
	});

	/** a dragged rail sets its width sixty times a second and none of them is a preference */
	it("waits for the value to hold still before writing it down", () => {
		vi.useFakeTimers();
		render(createElement(Box, { set: 260 }));
		const button = document.querySelector("button");

		act(() => button?.click());
		expect(document.querySelector("button")?.textContent).toBe("260");
		// on screen immediately, and not yet on disk
		expect(raw("rail.agent.width")).toBeNull();

		act(() => vi.advanceTimersByTime(250));
		expect(raw("rail.agent.width")).toBe("260");
	});
});
