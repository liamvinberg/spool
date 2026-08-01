// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished } from "vitest";
import type { Camera, ProjectedFrame } from "../api";
import { type Hand, type HandMark, handOf, LANE_MS, markKeyOf, rangeKeyOf } from "./agent-hand";
import { AgentHandLayer } from "./agent-hand-layer";
import type { AgentEntry, AgentRow } from "./agent-transcript";

/**
 * The agent's hand on a frame (#214): where it is, and what it has just changed.
 *
 * Two claims, and they are deliberately not the same claim. Presence is a fact about
 * the transcript, so it needs only a name off the wire and draws on any visible frame.
 * A located mark is a fact about the pixels, so it needs a box, and a box needs a
 * document — which is exactly what a frame drawn below the readable threshold does not
 * have.
 *
 * The stylesheet is read as a file at the bottom, because the lives and the envelope
 * live nowhere else: they are theme variables Tailwind resolves at build time, so no
 * mounted element can be asked what they are.
 */

const row = (over: Partial<AgentRow> = {}): AgentRow => ({
	key: "r",
	kind: "row",
	state: "done",
	verb: "read",
	subject: "home",
	frame: "home",
	count: 1,
	detail: null,
	step: null,
	shot: null,
	foreign: null,
	parent: null,
	delegated: [],
	...over,
});

const prose: AgentEntry = { key: "p", kind: "prose", full: "on it", landed: [], settled: true };

describe("where the agent is", () => {
	it("is nowhere at all while no turn is running", () => {
		expect(handOf([row({ state: "running" })], false)).toBeNull();
	});

	it("is nowhere while the turn has named no frame", () => {
		expect(handOf([prose, row({ frame: null, subject: "AGENTS.md", verb: "read" })], true)).toBeNull();
	});

	it("takes the whole frame in for a read and a segment of it for a write", () => {
		expect(handOf([row({ state: "running", verb: "read" })], true)).toMatchObject({ frame: "home", hold: "whole" });
		expect(handOf([row({ state: "running", verb: "edit" })], true)).toMatchObject({ frame: "home", hold: "part" });
		expect(handOf([row({ state: "running", verb: "write" })], true)).toMatchObject({ hold: "part" });
		// a call spool has no word for is the agent at that frame and nothing more
		expect(handOf([row({ state: "running", verb: "grep" })], true)).toMatchObject({ hold: "whole" });
	});

	it("stays where it was left between calls, slack rather than gone", () => {
		const hand = handOf([row({ key: "a", verb: "edit", state: "done", count: 3 })], true);

		// the thread is still on the frame and no call is open on it, which is what the
		// tension channel says and the length channel does not
		expect(hand).toMatchObject({ frame: "home", hold: "part", verb: null, count: 0, picturing: false });
	});

	it("takes the open call over the last one, wherever the open one is", () => {
		const hand = handOf(
			[
				row({ key: "a", frame: "home", verb: "edit" }),
				row({ key: "b", frame: "cart", verb: "shot", state: "running" }),
			],
			true,
		);

		expect(hand).toMatchObject({ frame: "cart", verb: "shot", picturing: true });
	});

	it("counts the open run, which is what plucks the thread", () => {
		expect(handOf([row({ state: "running", verb: "edit", count: 6 })], true)).toMatchObject({ count: 6 });
	});

	it("follows a delegate to the frame it is working, because its writes are the thread's", () => {
		const hand = handOf(
			[
				row({
					key: "a",
					verb: "delegate",
					frame: null,
					delegated: [row({ key: "d", frame: "cart", state: "running" })],
				}),
			],
			true,
		);

		expect(hand).toMatchObject({ frame: "cart" });
	});
});

const CAMERA: Camera = { x: 0, y: 0, k: 1 };
const FRAMES: ProjectedFrame[] = [
	{ name: "home", x: 100, y: 100, w: 390, h: 844, kind: "html" } as ProjectedFrame,
	{ name: "cart", x: 600, y: 100, w: 390, h: 844, kind: "html" } as ProjectedFrame,
];

const hand = (over: Partial<Hand> = {}): Hand => ({
	frame: "home",
	hold: "whole",
	verb: "read",
	count: 0,
	picturing: false,
	...over,
});

const mark = (over: Partial<HandMark> = {}): HandMark => ({
	key: markKeyOf("home", "c1"),
	frame: "home",
	box: { x: 20, y: 300, w: 350, h: 120 },
	...over,
});

function draw(props: Parameters<typeof AgentHandLayer>[0]): HTMLElement {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	act(() => root.render(createElement(AgentHandLayer, props)));
	return host;
}

const layer = (over: Partial<Parameters<typeof AgentHandLayer>[0]> = {}) =>
	draw({ camera: CAMERA, frames: FRAMES, hand: null, marks: [], shellRadius: 12, ...over });

describe("what the canvas draws", () => {
	it("draws nothing at all when nobody is at a frame and nothing has changed", () => {
		expect(layer().querySelector("[data-agent-hand]")?.children.length).toBe(0);
	});

	it("stands the presence beside the frame the agent is at, and beside no other", () => {
		const host = layer({ hand: hand() });

		expect(host.querySelector("[data-hand-node]")?.getAttribute("data-hand-node")).toBe("home");
		// two halves of one line, each winding off the node
		expect(host.querySelectorAll("[data-hand-thread]")).toHaveLength(2);
	});

	it("lets go of the frame it left while it takes hold of the next one", () => {
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		onTestFinished(() => {
			act(() => root.unmount());
			host.remove();
		});
		const at = (one: Hand | null) =>
			act(() =>
				root.render(
					createElement(AgentHandLayer, { camera: CAMERA, frames: FRAMES, hand: one, marks: [], shellRadius: 12 }),
				),
			);

		at(hand({ frame: "home" }));
		expect(nodes(host)).toEqual(["home"]);

		// both, for the length of the gesture: taking hold and letting go are the same
		// gesture in two directions, so neither of them may simply vanish
		at(hand({ frame: "cart" }));
		expect(nodes(host)).toEqual(["home", "cart"]);
		expect(host.querySelector('[data-hand-node="home"]')?.getAttribute("style")).toContain("opacity: 0");

		// the turn ended, and the hand that is done is still on the same element it was
		// drawn on — winding off it, rather than replaced by a fresh one already wound off
		const before = host.querySelector('[data-hand-node="cart"]');
		at(null);
		expect(nodes(host)).toEqual(["cart"]);
		expect(host.querySelector('[data-hand-node="cart"]')).toBe(before);
		expect(host.querySelector('[data-hand-node="cart"]')?.getAttribute("style")).toContain("opacity: 0");
		expect(offsets(host, "[data-hand-thread]")).toEqual([1, 1]);
	});

	it("holds the thread on the frame when the camera moves, and eases only its shape", () => {
		const host = document.createElement("div");
		document.body.append(host);
		const root = createRoot(host);
		onTestFinished(() => {
			act(() => root.unmount());
			host.remove();
		});
		const at = (camera: Camera) =>
			act(() =>
				root.render(
					createElement(AgentHandLayer, { camera, frames: FRAMES, hand: hand(), marks: [], shellRadius: 12 }),
				),
			);

		at(CAMERA);
		const shape = paths(host);
		const wall = () => host.querySelector("[data-hand-wall]")?.getAttribute("transform");
		expect(wall()).toBe("translate(88 522)");

		// the path is the only thing here that eases between its own states, so where the
		// frame *is* must not be inside it: a pan that moved the shape would drag the
		// thread after the camera for a fifth of a second every time
		at({ x: 300, y: -40, k: 1 });
		expect(paths(host)).toEqual(shape);
		expect(wall()).toBe("translate(388 482)");
	});

	it("draws no presence for a frame that is not on the field", () => {
		// the rail is the wayfinder, and the camera never moves for this (#216)
		expect(layer({ hand: hand({ frame: "ghost" }) }).querySelector("[data-hand-node]")).toBeNull();
	});

	it("runs the thread the frame's whole height for a read and a segment for a write", () => {
		const whole = layer({ hand: hand({ hold: "whole" }) });
		const part = layer({ hand: hand({ hold: "part" }) });

		expect(spanOf(whole)).toBeCloseTo(844, 0);
		expect(spanOf(part)).toBeCloseTo(76, 0);
	});

	it("takes the ink off the wall and strikes the corners while the frame is photographed", () => {
		const still = layer({ hand: hand({ verb: "read" }) });
		const shooting = layer({ hand: hand({ verb: "shot", picturing: true }) });

		expect(offsets(still)).toEqual([1, 1, 1, 1]);
		expect(offsets(shooting)).toEqual([0, 0, 0, 0]);
		// the thread has no length left while the corners are struck
		expect(spanOf(shooting)).toBeCloseTo(0, 0);
	});

	it("plates the block a write changed and marks its height on the wall", () => {
		const host = layer({ marks: [mark()] });
		const plate = host.querySelector("[data-hand-plate]") as HTMLElement;
		const lane = host.querySelector("[data-hand-lane]") as HTMLElement;

		// the block's own box, in the field's coordinates: the frame's corner plus the
		// document's own measurement of where the changed lines render
		expect(plate.style.left).toBe("120px");
		expect(plate.style.top).toBe("400px");
		expect(plate.style.width).toBe("350px");
		expect(plate.style.height).toBe("120px");
		// the lane stands outside the frame, at the height of the thing it is about
		expect(lane.style.top).toBe("400px");
		expect(Number.parseFloat(lane.style.left)).toBeLessThan(100);
	});

	it("scales a located mark with the camera and leaves the presence hairline", () => {
		const host = draw({
			camera: { x: 0, y: 0, k: 0.5 },
			frames: FRAMES,
			hand: hand(),
			marks: [mark()],
			shellRadius: 12,
			...{},
		});
		const plate = host.querySelector("[data-hand-plate]") as HTMLElement;
		const node = host.querySelector("[data-hand-node]") as HTMLElement;

		expect(plate.style.width).toBe("175px");
		// the node is furniture, so it is the same nine pixels at every zoom
		expect(node.style.width).toBe("9px");
	});

	it("draws a mark for a frame no longer on the field as nothing", () => {
		expect(layer({ marks: [mark({ frame: "ghost" })] }).querySelectorAll("[data-hand-plate]")).toHaveLength(0);
	});

	it("marks one write on every frame that shows it, which is what a shared component is", () => {
		const host = layer({
			marks: [mark(), mark({ key: markKeyOf("cart", "c1"), frame: "cart" })],
		});

		expect([...host.querySelectorAll("[data-hand-plate]")].map((el) => el.getAttribute("data-hand-plate"))).toEqual([
			"home",
			"cart",
		]);
	});
});

const nodes = (host: HTMLElement): string[] =>
	[...host.querySelectorAll("[data-hand-node]")].map((el) => el.getAttribute("data-hand-node") ?? "");

/** how far the thread runs, top of one half to the bottom of the other */
function spanOf(host: HTMLElement): number {
	const ends = [...host.querySelectorAll("[data-hand-thread]")].map((path) => {
		const points = (path.getAttribute("d") ?? "").replace("M ", "").split(" L ");
		return Number.parseFloat(points[points.length - 1]?.split(" ")[1] ?? "0");
	});
	return Math.abs((ends[0] ?? 0) - (ends[1] ?? 0));
}

const offsets = (host: HTMLElement, selector = "[data-hand-corner]"): number[] =>
	[...host.querySelectorAll(selector)].map((path) => Number.parseFloat(path.getAttribute("stroke-dashoffset") ?? "0"));

/** every drawn thread shape, which is what may ease — and so what a pan may not touch */
const paths = (host: HTMLElement): (string | null)[] =>
	[...host.querySelectorAll("[data-hand-thread]")].map((path) => path.getAttribute("d"));

describe("the marks' own lives, which came from the capture", () => {
	const CSS = readFileSync(join(import.meta.dirname, "..", "ui.css"), "utf8");

	it("keeps a plate on the frame for 860ms and a lane on the wall for six seconds", () => {
		// both numbers came from the capture rather than from taste, and `ui.css` is where
		// that argument lives. What is pinned here is that neither drifts, and that the
		// canvas holds a mark for exactly as long as the wall draws one
		expect(CSS).toContain("--animate-hand-plate: hand-plate 860ms");
		expect(CSS).toContain(`--animate-hand-lane: hand-lane ${LANE_MS}ms`);
	});

	it("opens a plate from the block's own centre rather than fading it in", () => {
		const at = CSS.indexOf("@keyframes hand-plate ");
		const body = CSS.slice(at, CSS.indexOf("@keyframes", at + 1));

		expect(body).toContain("transform: scaleY(0.34)");
		expect(body).toContain("opacity: 0.15");
		// out fast, hold flat, in slow: one curve over the whole 860ms would make the
		// opening lazy and the draining abrupt
		expect(body).toContain("animation-timing-function: ease-out");
		expect(body).toContain("animation-timing-function: ease-in");
	});

	it("holds a located mark still under reduced motion rather than leaving it on the frame", () => {
		// `animation: none` would be catastrophic here and nowhere else: what carries a
		// plate away is the animation, so it would sit at full ink over the design for the
		// rest of the session
		const still = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));

		expect(still).toContain("animation: hand-plate-still");
		expect(still).toContain("animation: hand-lane-still");
		expect(still.slice(still.indexOf(".animate-hand-wind"))).toContain("animation: none");
	});
});

describe("the key two sides of one question agree on", () => {
	it("spells a range apart from a stamp, because they are different questions", () => {
		expect(rangeKeyOf("frames/home/frame.tsx", 4, 9)).toBe("frames/home/frame.tsx:4-9");
		expect(markKeyOf("home", "call-1")).toBe("home:call-1");
	});
});
