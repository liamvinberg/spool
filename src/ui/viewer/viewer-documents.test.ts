// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOVE_HOLD_MS } from "../canvas/lifecycle";
import { ARRIVE_DEADLINE_MS, FieldDocuments, LOAD_DEADLINE_MS } from "./viewer-documents";

/** The documents of a canvas whose frames are made at `revisions`, with a stand-in iframe for each one booted. */
function documents() {
	const revisions = new Map<string, number>();
	const field = new FieldDocuments((name) => ({
		src: `https://frames.test/${name}`,
		revision: String(revisions.get(name) ?? 0),
	}));
	const windows = new Map<string, { postMessage: ReturnType<typeof vi.fn> }>();
	/** Mount every document the store wants, as the shells do. */
	const mount = () => {
		for (const name of field.live)
			for (const document of field.entry(name)?.documents ?? []) {
				const key = `${name}@${document.revision}`;
				if (windows.has(key)) continue;
				const window = { postMessage: vi.fn() };
				windows.set(key, window);
				field.attach(name, document.revision, { contentWindow: window } as unknown as HTMLIFrameElement);
			}
	};
	field.subscribe(mount);
	const say = (name: string, revision: string, spool: "loaded" | "arrived") =>
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { spool, frame: name },
				source: windows.get(`${name}@${revision}`) as unknown as Window,
			}),
		);
	const phases = (name: string) => field.entry(name)?.documents.map((each) => `${each.revision}:${each.phase}`);
	return { field, revisions, windows, say, phases };
}

let stop: () => void = () => {};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
	stop();
	vi.useRealTimers();
});

describe("the read-only canvas's documents", () => {
	it("boots two at a time, nearest first, and the next as one arrives", () => {
		const { field, say, phases } = documents();
		stop = field.listen();
		field.setLive(["a", "b", "c"]);
		expect([phases("a"), phases("b"), phases("c")]).toEqual([["0:booting"], ["0:booting"], []]);
		expect(field.entry("c")?.loading).toBe(true);
		say("a", "0", "loaded");
		expect(phases("a")).toEqual(["0:loaded"]);
		say("a", "0", "arrived");
		expect(field.entry("a")).toMatchObject({ shown: true, loading: false });
		expect(phases("c")).toEqual(["0:booting"]);
	});

	it("asks a loaded document to arrive, and shows one that never says so at the deadline", () => {
		const { field, say, phases, windows } = documents();
		stop = field.listen();
		field.setLive(["a"]);
		say("a", "0", "loaded");
		expect(windows.get("a@0")?.postMessage).toHaveBeenCalledWith(expect.objectContaining({ spool: "arrive" }), "*");
		vi.advanceTimersByTime(ARRIVE_DEADLINE_MS);
		expect(phases("a")).toEqual(["0:arrived"]);
	});

	it("lets go a document that never loads, until its frame is made again", () => {
		const { field, revisions } = documents();
		stop = field.listen();
		field.setLive(["a"]);
		vi.advanceTimersByTime(LOAD_DEADLINE_MS);
		expect(field.entry("a")).toBeUndefined();
		expect([...field.failed]).toEqual(["a"]);
		revisions.set("a", 1);
		expect([...field.failed]).toEqual([]);
	});

	it("boots nothing while the camera moves, and holds what arrived until it has rested a while", () => {
		const { field, say, phases, windows } = documents();
		stop = field.listen();
		field.setLive(["a"]);
		say("a", "0", "loaded");
		say("a", "0", "arrived");
		field.setMoving(true);
		expect(windows.get("a@0")?.postMessage).toHaveBeenLastCalledWith({ spool: "freeze", on: true }, "*");
		field.setLive(["a", "b"]);
		expect(phases("b")).toEqual([]);
		field.setMoving(false);
		expect(phases("b")).toEqual(["0:booting"]);
		vi.advanceTimersByTime(MOVE_HOLD_MS);
		expect(windows.get("a@0")?.postMessage).toHaveBeenLastCalledWith({ spool: "freeze", on: false }, "*");
	});

	it("boots a frame made again behind the document on show, which goes once the new one arrives", () => {
		const { field, revisions, say, phases } = documents();
		stop = field.listen();
		field.setLive(["a"]);
		say("a", "0", "loaded");
		say("a", "0", "arrived");
		revisions.set("a", 1);
		field.refresh();
		expect(phases("a")).toEqual(["0:arrived", "1:booting"]);
		expect(field.entry("a")).toMatchObject({ shown: true, loading: true });
		say("a", "1", "loaded");
		say("a", "1", "arrived");
		expect(phases("a")).toEqual(["1:arrived"]);
	});
});
