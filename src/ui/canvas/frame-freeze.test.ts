// @vitest-environment happy-dom

import { act, createElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Camera, ProjectedFrame } from "../api";
import { IDLE_FREEZE_MS, isFrameAttended, isFrameFrozen, MOVE_HOLD_MS, useFrameLifecycle } from "./lifecycle";
import { CHECK_EVERY_MS } from "./rest-strain";

/**
 * The freeze (#171, #172, #319): a live HTML frame holds its animations while
 * the camera moves, once a minute passes with nothing attending it, and for as
 * long as the hand holds an element anywhere on the canvas. Here it is the
 * traffic on one real frame window — the decisions are `isFrameFrozen` and
 * `isFrameAttended`, the delivery is one message per document, and they are
 * tested apart because only the first two are rules.
 */

type Lifecycle = ReturnType<typeof useFrameLifecycle>;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLDivElement | undefined;
/** The clock the sweep and the idle bookkeeping both read. */
let clock = 0;

beforeEach(() => {
	// the hold past a camera's rest, and the rest watcher's checks, run on these
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
	clock = 1_000;
	vi.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(async () => {
	if (root !== undefined) await act(() => root?.unmount());
	host?.remove();
	root = undefined;
	host = undefined;
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

const landing: ProjectedFrame = {
	name: "landing",
	// drawn wide enough to read at k=1, so the resting camera makes it live
	x: 0,
	y: 0,
	w: 600,
	h: 600,
	cover: { hash: "0".repeat(32) },
};

interface Attention {
	entered?: string | null;
	selected?: string | null;
	hovered?: string | null;
	/** The Edit tool is on (#319, #339). */
	editing?: boolean;
}

async function mountLive(options: Attention & { frame?: ProjectedFrame } = {}) {
	const frame = options.frame ?? landing;
	const framesRef = { current: [frame] } as unknown as RefObject<ProjectedFrame[]>;
	let lifecycle: Lifecycle | undefined;
	let attention: Attention = options;

	function Harness({ props }: { props: Attention }) {
		lifecycle = useFrameLifecycle({
			framesRef,
			entered: props.entered ?? null,
			// deliberately empty: a selection the current tool does not mount for is
			// still a selection, and the freeze has to see it (#172)
			selectionTargets: new Set(),
			selected: props.selected == null ? [] : [props.selected],
			hovered: props.hovered ?? null,
			editing: props.editing ?? false,
			cameraRef: { current: { x: 0, y: 0, k: 1 } } as RefObject<Camera | null>,
			// only the CSS size is read, and happy-dom gives a real div none
			viewportRef: { current: { clientWidth: 1200, clientHeight: 1200 } } as unknown as RefObject<HTMLElement>,
		});
		return null;
	}

	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	const render = async (next: Attention = {}) => {
		attention = { ...attention, ...next };
		await act(() => root?.render(createElement(Harness, { props: attention })));
	};
	await render();

	const iframe = document.createElement("iframe");
	host.append(iframe);
	const sourceWindow = iframe.contentWindow;
	if (lifecycle === undefined || sourceWindow === null) throw new Error("lifecycle did not mount");
	await act(() => {
		lifecycle?.onIframe(frame.name, iframe);
		lifecycle?.noteLoaded(frame.name);
		lifecycle?.sweep();
	});
	if (lifecycle === undefined) throw new Error("lifecycle did not update");
	const post = vi.spyOn(sourceWindow, "postMessage").mockImplementation(() => undefined);
	/** Let `ms` of nothing happening pass, sweeping the way the interval would. */
	const wait = async (ms: number) => {
		clock += ms;
		await act(() => lifecycle?.sweep());
	};
	return { lifecycle, iframe, post, render, wait };
}

interface Posted {
	spool?: string;
	on?: boolean;
}

const posted = (post: { mock: { calls: unknown[][] } }): Posted[] =>
	post.mock.calls.map(([message]) => message as Posted);

const freezes = (post: { mock: { calls: unknown[][] } }): Posted[] =>
	posted(post).filter((message) => message.spool === "freeze");

/** The camera comes to rest, and the hold past its rest runs out. */
async function rest(lifecycle: Lifecycle) {
	await act(() => lifecycle.noteCameraMoving(false));
	await act(() => vi.advanceTimersByTime(MOVE_HOLD_MS));
}

const held = { spool: "freeze", on: true };
const handedBack = { spool: "freeze", on: false };

describe("which frames hold their animations", () => {
	const resting = {
		cameraMoving: false,
		idleMs: 0,
		state: "live" as const,
		entered: false,
		capturing: false,
		editing: false,
		crowded: false,
	};

	it("freezes a live frame while the camera is moving", () => {
		expect(isFrameFrozen(resting)).toBe(false);
		expect(isFrameFrozen({ ...resting, cameraMoving: true })).toBe(true);
	});

	it("freezes a live frame nothing has attended for the whole minute", () => {
		expect(isFrameFrozen({ ...resting, idleMs: IDLE_FREEZE_MS - 1 })).toBe(false);
		expect(isFrameFrozen({ ...resting, idleMs: IDLE_FREEZE_MS })).toBe(true);
	});

	it("freezes every live frame while the Edit tool is on", () => {
		// the whole field, at rest, with nobody near this frame in particular:
		// the tool being up is the whole rule (#319, #339)
		expect(isFrameFrozen({ ...resting, editing: true })).toBe(true);
	});

	it("keeps the same frames running while the Edit tool is on", () => {
		// the tool is no reason to export a frame held, to stop the frame whose
		// own hands are inside it, or to touch a still
		expect(isFrameFrozen({ ...resting, editing: true, entered: true })).toBe(false);
		expect(isFrameFrozen({ ...resting, editing: true, capturing: true })).toBe(false);
		expect(isFrameFrozen({ ...resting, editing: true, state: "held" })).toBe(false);
		expect(isFrameFrozen({ ...resting, editing: true, state: "picture" })).toBe(false);
	});

	it("freezes the frame you went inside only while the camera carries you", () => {
		// a zoom out of a frame you are in is a move like any other
		expect(isFrameFrozen({ ...resting, cameraMoving: true, entered: true })).toBe(true);
		expect(isFrameFrozen({ ...resting, idleMs: IDLE_FREEZE_MS * 10, entered: true })).toBe(false);
		expect(isFrameFrozen({ ...resting, crowded: true, entered: true })).toBe(false);
	});

	it("freezes a live frame holding back the canvas at rest, without waiting out the minute", () => {
		expect(isFrameFrozen({ ...resting, crowded: true })).toBe(true);
		expect(isFrameFrozen({ ...resting, crowded: true, state: "picture" })).toBe(false);
		expect(isFrameFrozen({ ...resting, crowded: true, capturing: true })).toBe(false);
	});

	it("never freezes a frame being copied for an export", () => {
		// an export's capture settles on the frame's own rAF and animations
		expect(isFrameFrozen({ ...resting, cameraMoving: true, capturing: true })).toBe(false);
		expect(isFrameFrozen({ ...resting, idleMs: IDLE_FREEZE_MS * 10, capturing: true })).toBe(false);
	});

	it("leaves a frame showing its picture, and one held behind it, alone", () => {
		for (const state of ["picture", "held", undefined] as const) {
			expect(isFrameFrozen({ ...resting, cameraMoving: true, state })).toBe(false);
			expect(isFrameFrozen({ ...resting, idleMs: IDLE_FREEZE_MS * 10, state })).toBe(false);
		}
	});
});

describe("what counts as attending a frame", () => {
	const nobody = { cameraMoving: false, entered: false, selected: false, hovered: false };

	it("is a person doing something, never a frame merely being on screen", () => {
		expect(isFrameAttended(nobody)).toBe(false);
		expect(isFrameAttended({ ...nobody, hovered: true })).toBe(true);
		expect(isFrameAttended({ ...nobody, selected: true })).toBe(true);
		expect(isFrameAttended({ ...nobody, entered: true })).toBe(true);
		expect(isFrameAttended({ ...nobody, cameraMoving: true })).toBe(true);
	});
});

describe("delivering the freeze", () => {
	it("holds a live frame for the gesture and hands it back on settle", async () => {
		const { lifecycle, post } = await mountLive();

		await act(() => lifecycle.noteCameraMoving(true));
		expect(freezes(post)).toEqual([held]);

		// a gesture is thousands of camera values, not two — one message each way
		await act(() => lifecycle.noteCameraMoving(true));
		await act(() => lifecycle.sweep());
		expect(freezes(post)).toEqual([held]);

		// held past the rest for as long as the next step of a heavy gesture may take
		await act(() => lifecycle.noteCameraMoving(false));
		await act(() => vi.advanceTimersByTime(MOVE_HOLD_MS - 1));
		expect(freezes(post)).toEqual([held]);
		await act(() => vi.advanceTimersByTime(1));
		expect(freezes(post)).toEqual([held, handedBack]);
	});

	it("holds through a gesture whose steps come further apart than a rest", async () => {
		const { lifecycle, post } = await mountLive();
		for (let step = 0; step < 5; step++) {
			await act(() => lifecycle.noteCameraMoving(true));
			await act(() => lifecycle.noteCameraMoving(false));
			await act(() => vi.advanceTimersByTime(150));
		}
		expect(freezes(post)).toEqual([held]);
	});

	it("holds the frame you went inside only for a move, never for the minute", async () => {
		const { lifecycle, post, wait } = await mountLive({ entered: "landing" });

		await wait(IDLE_FREEZE_MS * 2);
		expect(freezes(post)).toEqual([]);

		await act(() => lifecycle.noteCameraMoving(true));
		await rest(lifecycle);
		await wait(IDLE_FREEZE_MS * 2);
		expect(freezes(post)).toEqual([held, handedBack]);
	});

	it("thaws before it asks a frozen frame to copy itself for an export", async () => {
		const { lifecycle, post } = await mountLive();
		await act(() => lifecycle.noteCameraMoving(true));

		await act(async () => {
			void lifecycle.captureExport("landing");
		});

		// the thaw rides the same channel to the same document, so it cannot land
		// after the capture whose settle it feeds
		expect(
			posted(post).map((message) => `${message.spool}${message.on === undefined ? "" : `:${message.on}`}`),
		).toEqual(["freeze:true", "freeze:false", "capture"]);
	});

	it("forgets a frame whose document left, so a fresh one is never thought frozen", async () => {
		const { lifecycle, iframe, post } = await mountLive();
		await act(() => lifecycle.noteCameraMoving(true));
		expect(freezes(post)).toHaveLength(1);

		// the reload took the freeze with it; the replacement has to be told again
		await act(() => lifecycle.onIframe("landing", null));
		await act(() => lifecycle.onIframe("landing", iframe));
		await act(() => lifecycle.sweep());

		expect(freezes(post)).toEqual([held, held]);
	});

	it("holds a frame the canvas has left alone for the minute", async () => {
		const { post, wait } = await mountLive();

		await wait(IDLE_FREEZE_MS - 1);
		expect(freezes(post), "a frame still inside the minute keeps running").toEqual([]);

		await wait(1);
		expect(freezes(post)).toEqual([held]);
	});

	it("hands it back the moment the pointer arrives, and starts the minute over when it leaves", async () => {
		const { post, render, wait } = await mountLive();
		await wait(IDLE_FREEZE_MS);
		expect(freezes(post)).toEqual([held]);

		// the wake is the hover itself, not the sweep that may be 300ms behind it
		await render({ hovered: "landing" });
		expect(freezes(post)).toEqual([held, handedBack]);

		await render({ hovered: null });
		await wait(IDLE_FREEZE_MS - 1);
		expect(freezes(post)).toEqual([held, handedBack]);
		await wait(1);
		expect(freezes(post)).toEqual([held, handedBack, held]);
	});

	it("hands it back when the tab comes back, before anybody touches anything", async () => {
		const { lifecycle, post, wait } = await mountLive();
		await wait(IDLE_FREEZE_MS);
		expect(freezes(post)).toEqual([held]);

		// twenty minutes hidden is twenty minutes nobody attended anything, and
		// the return is the attention: a canvas you are looking at animates
		await act(() => lifecycle.wake());
		expect(freezes(post)).toEqual([held, handedBack]);

		// and the minute runs from the return, not from before it
		await wait(IDLE_FREEZE_MS - 1);
		expect(freezes(post)).toEqual([held, handedBack]);
		await wait(1);
		expect(freezes(post)).toEqual([held, handedBack, held]);
	});

	it("gives a fresh document the whole minute, so an edit is never watched half-arrived", async () => {
		const { lifecycle, iframe, post, wait } = await mountLive();
		await wait(IDLE_FREEZE_MS);
		expect(freezes(post)).toEqual([held]);

		// a source edit lands as a fresh document on a canvas nobody is at
		await act(() => lifecycle.onIframe("landing", null));
		await act(() => lifecycle.onIframe("landing", iframe));
		await wait(0);
		await wait(IDLE_FREEZE_MS - 1);
		expect(freezes(post), "the frame that just arrived gets to finish arriving").toEqual([held]);

		await wait(1);
		expect(freezes(post)).toEqual([held, held]);
	});

	it("leaves a selected frame running however long it is left", async () => {
		const { post, render, wait } = await mountLive({ selected: "landing" });

		await wait(IDLE_FREEZE_MS * 5);
		expect(freezes(post)).toEqual([]);

		// deselected, its minute runs from the deselection
		await render({ selected: null });
		await wait(IDLE_FREEZE_MS - 1);
		expect(freezes(post)).toEqual([]);
		await wait(1);
		expect(freezes(post)).toEqual([held]);
	});

	it("holds the very frame the hand is editing, and hands it back when the tool goes down", async () => {
		// the frame the Edit tool is working in is attended by definition, so
		// the idle clock never reaches it: the tool is what freezes it (#319, #339)
		const { post, render, wait } = await mountLive({ selected: "landing" });

		await render({ editing: true });
		expect(freezes(post)).toEqual([held]);

		// and it stays held for as long as the tool is up, however long that is
		await wait(IDLE_FREEZE_MS * 2);
		expect(freezes(post)).toEqual([held]);

		// putting the tool down lets it go, whatever is still selected
		await render({ editing: false });
		expect(freezes(post)).toEqual([held, handedBack]);

		// and once nobody attends it, the minute runs from then
		await render({ selected: null });
		await wait(IDLE_FREEZE_MS - 1);
		expect(freezes(post)).toEqual([held, handedBack]);
		await wait(1);
		expect(freezes(post)).toEqual([held, handedBack, held]);
	});

	it("starts the minute over when the camera stops", async () => {
		const { lifecycle, post, wait } = await mountLive();
		await wait(IDLE_FREEZE_MS);
		expect(freezes(post)).toEqual([held]);

		await act(() => lifecycle.noteCameraMoving(true));
		clock += 2_000;
		await rest(lifecycle);
		expect(freezes(post), "a frame frozen by idleness thaws where the camera stopped").toEqual([held, handedBack]);

		await wait(IDLE_FREEZE_MS - 1);
		expect(freezes(post)).toEqual([held, handedBack]);
		await wait(1);
		expect(freezes(post)).toEqual([held, handedBack, held]);
	});

	it("holds a frame that holds back the canvas at rest until it is pointed at, and again after", async () => {
		const frames: FrameRequestCallback[] = [];
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
		const { post, render } = await mountLive();
		/** one sample of the canvas at rest, its display frames `gap` apart */
		const sample = async (gap: number) => {
			clock += CHECK_EVERY_MS;
			await act(() => vi.advanceTimersByTime(CHECK_EVERY_MS));
			await act(() => {
				for (let frame = 0; frame < 20 && frames.length > 0; frame++) {
					clock += gap;
					for (const callback of frames.splice(0)) callback(clock);
				}
			});
		};

		await sample(8);
		await sample(8);
		expect(freezes(post), "a canvas keeping up holds nothing").toEqual([]);

		await sample(160);
		await sample(160);
		expect(freezes(post)).toEqual([held]);

		// pointing at it is watching it, slow or not
		await render({ hovered: "landing" });
		expect(freezes(post)).toEqual([held, handedBack]);
		// and it holds again the moment the pointer leaves, with no wait to find out again
		await render({ hovered: null });
		expect(freezes(post)).toEqual([held, handedBack, held]);
	});
});
