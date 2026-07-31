// @vitest-environment happy-dom

import { act, createElement, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Camera, ProjectedFrame } from "../api";
import { freezesWhileMoving, useFrameLifecycle } from "./lifecycle";

/**
 * The freeze (#171): a live HTML frame holds its animations while the camera
 * moves and gets them back on settle. Here it is the traffic on one real frame
 * window — the decision is `freezesWhileMoving`, the delivery is one message per
 * document, and the two are tested apart because only the first is a rule.
 */

type Lifecycle = ReturnType<typeof useFrameLifecycle>;

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLDivElement | undefined;

afterEach(async () => {
	if (root !== undefined) await act(() => root?.unmount());
	host?.remove();
	root = undefined;
	host = undefined;
});

const landing: ProjectedFrame = {
	name: "landing",
	kind: "html",
	// drawn wide enough to read at k=1, so the resting camera makes it live
	x: 0,
	y: 0,
	w: 600,
	h: 600,
	cover: { hash: "0".repeat(32) },
};

async function mountLive(options: { entered?: string; frame?: ProjectedFrame } = {}) {
	const frames = [options.frame ?? landing];
	const framesRef = { current: frames } as unknown as RefObject<ProjectedFrame[]>;
	let lifecycle: Lifecycle | undefined;
	function Harness() {
		lifecycle = useFrameLifecycle({
			framesRef,
			entered: options.entered ?? null,
			selectionTargets: new Set(),
			hasCover: () => true,
			onShot: () => undefined,
			cameraRef: { current: { x: 0, y: 0, k: 1 } } as RefObject<Camera | null>,
			// only the CSS size is read, and happy-dom gives a real div none
			viewportRef: { current: { clientWidth: 1200, clientHeight: 1200 } } as unknown as RefObject<HTMLElement>,
			pictured: false,
		});
		return null;
	}
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(() => root?.render(createElement(Harness)));

	const iframe = document.createElement("iframe");
	host.append(iframe);
	const sourceWindow = iframe.contentWindow;
	if (lifecycle === undefined || sourceWindow === null) throw new Error("lifecycle did not mount");
	await act(() => {
		lifecycle?.onIframe(frames[0]?.name ?? "landing", iframe);
		lifecycle?.noteLoaded(frames[0]?.name ?? "landing");
		lifecycle?.sweep();
	});
	if (lifecycle === undefined) throw new Error("lifecycle did not update");
	const post = vi.spyOn(sourceWindow, "postMessage").mockImplementation(() => undefined);
	return { lifecycle, iframe, post };
}

interface Posted {
	spool?: string;
	on?: boolean;
}

const posted = (post: { mock: { calls: unknown[][] } }): Posted[] =>
	post.mock.calls.map(([message]) => message as Posted);

const freezes = (post: { mock: { calls: unknown[][] } }): Posted[] =>
	posted(post).filter((message) => message.spool === "freeze");

describe("which frames hold their animations", () => {
	const resting = { cameraMoving: false, state: "live" as const, entered: false, capturing: false };

	it("freezes a live frame only while the camera is moving", () => {
		expect(freezesWhileMoving(resting)).toBe(false);
		expect(freezesWhileMoving({ ...resting, cameraMoving: true })).toBe(true);
	});

	it("never freezes the frame you went inside", () => {
		expect(freezesWhileMoving({ ...resting, cameraMoving: true, entered: true })).toBe(false);
	});

	it("never freezes a borrowed frame or one already photographing itself", () => {
		// a borrowed frame's capture settles on its own rAF and animations
		expect(freezesWhileMoving({ ...resting, cameraMoving: true, state: "refreshing" })).toBe(false);
		expect(freezesWhileMoving({ ...resting, cameraMoving: true, capturing: true })).toBe(false);
	});

	it("leaves a frame showing its picture, and one held behind it, alone", () => {
		expect(freezesWhileMoving({ ...resting, cameraMoving: true, state: "picture" })).toBe(false);
		expect(freezesWhileMoving({ ...resting, cameraMoving: true, state: "held" })).toBe(false);
		expect(freezesWhileMoving({ ...resting, cameraMoving: true, state: undefined })).toBe(false);
	});
});

describe("delivering the freeze", () => {
	it("holds a live frame for the gesture and hands it back on settle", async () => {
		const { lifecycle, post } = await mountLive();

		await act(() => lifecycle.noteCameraMoving(true));
		expect(freezes(post)).toEqual([{ spool: "freeze", on: true }]);

		// a gesture is thousands of camera values, not two — one message each way
		await act(() => lifecycle.noteCameraMoving(true));
		await act(() => lifecycle.sweep());
		expect(freezes(post)).toEqual([{ spool: "freeze", on: true }]);

		await act(() => lifecycle.noteCameraMoving(false));
		expect(freezes(post)).toEqual([
			{ spool: "freeze", on: true },
			{ spool: "freeze", on: false },
		]);
	});

	it("says nothing to the frame you went inside", async () => {
		const { lifecycle, post } = await mountLive({ entered: "landing" });

		await act(() => lifecycle.noteCameraMoving(true));

		expect(freezes(post)).toEqual([]);
	});

	it("says nothing to a terminal, whose freeze is the daemon's own", async () => {
		const { lifecycle, post } = await mountLive({ frame: { ...landing, kind: "term" } });

		await act(() => lifecycle.noteCameraMoving(true));

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

		expect(freezes(post)).toEqual([
			{ spool: "freeze", on: true },
			{ spool: "freeze", on: true },
		]);
	});
});
