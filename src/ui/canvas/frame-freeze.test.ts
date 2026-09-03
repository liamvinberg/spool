// @vitest-environment happy-dom

import { act, createElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Camera, ProjectedFrame } from "../api";
import { IDLE_FREEZE_MS, isFrameAttended, isFrameFrozen, useFrameLifecycle } from "./lifecycle";

/**
 * The freeze (#171, #172): a live HTML frame holds its animations while the
 * camera moves, and again once a minute passes with nothing attending it. Here
 * it is the traffic on one real frame window — the decisions are
 * `isFrameFrozen` and `isFrameAttended`, the delivery is one message per
 * document, and they are tested apart because only the first two are rules.
 */

type Lifecycle = ReturnType<typeof useFrameLifecycle>;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLDivElement | undefined;
/** The clock the sweep and the idle bookkeeping both read. */
let clock = 0;

beforeEach(() => {
	clock = 1_000;
	vi.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(async () => {
	if (root !== undefined) await act(() => root?.unmount());
	host?.remove();
	root = undefined;
	host = undefined;
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
}

async function mountLive(options: Attention & { frame?: ProjectedFrame } = {}) {
	const frame = options.frame ?? landing;
	const framesRef = { current: [frame] } as unknown as RefObject<ProjectedFrame[]>;
	let lifecycle: Lifecycle | undefined;
	let attention: Attention = options;

	function Harness({ props }: { props: Attention }) {
		lifecycle = useFrameLifecycle({
			framesRef,
			// one page, and it is the whole project
			allFramesRef: framesRef,
			entered: props.entered ?? null,
			// deliberately empty: a selection the current tool does not mount for is
			// still a selection, and the freeze has to see it (#172)
			selectionTargets: new Set(),
			selected: props.selected == null ? [] : [props.selected],
			hovered: props.hovered ?? null,
			hasCover: () => true,
			onShot: () => undefined,
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

const held = { spool: "freeze", on: true };
const handedBack = { spool: "freeze", on: false };

describe("which frames hold their animations", () => {
	const resting = { cameraMoving: false, idleMs: 0, state: "live" as const, entered: false, capturing: false };

	it("freezes a live frame while the camera is moving", () => {
		expect(isFrameFrozen(resting)).toBe(false);
		expect(isFrameFrozen({ ...resting, cameraMoving: true })).toBe(true);
	});

	it("freezes a live frame nothing has attended for the whole minute", () => {
		expect(isFrameFrozen({ ...resting, idleMs: IDLE_FREEZE_MS - 1 })).toBe(false);
		expect(isFrameFrozen({ ...resting, idleMs: IDLE_FREEZE_MS })).toBe(true);
	});

	it("never freezes the frame you went inside", () => {
		expect(isFrameFrozen({ ...resting, cameraMoving: true, entered: true })).toBe(false);
		expect(isFrameFrozen({ ...resting, idleMs: IDLE_FREEZE_MS * 10, entered: true })).toBe(false);
	});

	it("never freezes a borrowed frame or one already photographing itself", () => {
		// a borrowed frame's capture settles on its own rAF and animations
		expect(isFrameFrozen({ ...resting, cameraMoving: true, state: "refreshing" })).toBe(false);
		expect(isFrameFrozen({ ...resting, idleMs: IDLE_FREEZE_MS * 10, state: "refreshing" })).toBe(false);
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

		await act(() => lifecycle.noteCameraMoving(false));
		expect(freezes(post)).toEqual([held, handedBack]);
	});

	it("says nothing to the frame you went inside", async () => {
		const { lifecycle, post, wait } = await mountLive({ entered: "landing" });

		await act(() => lifecycle.noteCameraMoving(true));
		await wait(IDLE_FREEZE_MS * 2);

		expect(freezes(post)).toEqual([]);
	});

	it("thaws before it asks a frozen frame to photograph itself", async () => {
		const { lifecycle, post } = await mountLive();
		await act(() => lifecycle.noteCameraMoving(true));

		await act(async () => {
			void lifecycle.capture("landing");
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

	it("starts the minute over when the camera stops", async () => {
		const { lifecycle, post, wait } = await mountLive();
		await wait(IDLE_FREEZE_MS);
		expect(freezes(post)).toEqual([held]);

		await act(() => lifecycle.noteCameraMoving(true));
		clock += 2_000;
		await act(() => lifecycle.noteCameraMoving(false));
		expect(freezes(post), "a frame frozen by idleness thaws where the camera stopped").toEqual([held, handedBack]);

		await wait(IDLE_FREEZE_MS - 1);
		expect(freezes(post)).toEqual([held, handedBack]);
		await wait(1);
		expect(freezes(post)).toEqual([held, handedBack, held]);
	});
});
