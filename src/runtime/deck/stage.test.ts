// @vitest-environment happy-dom
import { type ComponentType, createElement, useEffect, useState, useSyncExternalStore } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { openSession, type StageSession, type StageState } from "../../deck/stage-session";
import type { HostMessage, SlideReadiness, StageMessage, StageShown } from "../../deck/stage-wire";

/**
 * The stage's own rules for what may go on the room's screen (spool#265), in one render document with its slides
 * drawn by React and its host faked: what a browser alone shows is `src/daemon/deck/stage-browser.test.ts`'s.
 */

interface Slide {
	frame: string;
	screen: ComponentType;
	live?: boolean;
	beats?: number;
}

interface Stage {
	said: StageMessage[];
	send(message: HostMessage): void;
	/** a write to `ui.state`, as a slide makes one */
	write(next: StageState): void;
	state(): StageState;
	/** the frame on screen */
	onScreen(): string | undefined;
	shown(): StageShown[];
	slides(): readonly SlideReadiness[];
}

let stateNow: StageState = {};
const stateHeard = new Set<() => void>();
/** `ui.state` as a slide reads it */
function useTalkState(): StageState {
	return useSyncExternalStore(
		(listener) => {
			stateHeard.add(listener);
			return () => stateHeard.delete(listener);
		},
		() => stateNow,
	);
}
/** `ui.beats` as a slide calls it, from the stage's own module */
let useBeats: (names: readonly [string, ...string[]]) => { name: string } = () => ({ name: "" });
const writeState = (next: StageState) => {
	stateNow = next;
	for (const listener of [...stateHeard]) listener();
};

async function stage(
	slides: readonly Slide[],
	open: { mode: "own" | "follow"; room: boolean; session?: StageSession },
	loadStyle: (frame: string) => Promise<void> = async () => {},
): Promise<Stage> {
	vi.resetModules();
	stateNow = open.session?.state ?? {};
	const said: StageMessage[] = [];
	let port: MessagePort | undefined;
	Object.defineProperty(window, "parent", {
		configurable: true,
		value: {
			postMessage(_message: unknown, _origin: string, ports: MessagePort[]) {
				port = ports[0];
				if (port !== undefined) port.onmessage = (event) => said.push(event.data as StageMessage);
			},
		},
	});
	Object.defineProperty(document, "fonts", { configurable: true, value: new Set() });
	(window as unknown as { __SPOOL_PLAY__: unknown }).__SPOOL_PLAY__ = {
		deck: {
			page: "talk",
			size: { w: 160, h: 90 },
			slides: slides.map(({ frame, live, beats }) => ({
				frame,
				beats: beats ?? 1,
				live: live === true,
				w: 160,
				h: 90,
			})),
		},
	};
	document.body.innerHTML = '<div id="root"></div>';
	const { bootStage } = await import("./stage");
	// a slide outside the stage's scopes would be no frame; every slide here is inside one
	const outside = { frame: () => "", report: () => {} };
	useBeats = (await import("../slide-beats")).slideCalls(outside).beats;
	bootStage({
		load: async (frame) => {
			const screen = slides.find((slide) => slide.frame === frame)?.screen;
			return screen === undefined ? { broken: "no such slide", when: "load" } : { component: screen };
		},
		loadStyle,
		activateStyle: () => {},
		styleOf: () => undefined,
		state: {
			read: () => structuredClone(stateNow),
			seed: (next) => writeState(structuredClone(next)),
			subscribe: (listener) => {
				stateHeard.add(listener);
				return () => stateHeard.delete(listener);
			},
		},
	});
	const send = (message: HostMessage) => port?.postMessage(message);
	send({ spool: "stage-open", ...open });
	const of = <K extends StageMessage["spool"]>(kind: K) =>
		said.filter((message): message is Extract<StageMessage, { spool: K }> => message.spool === kind);
	return {
		said,
		send,
		write: writeState,
		state: () => stateNow,
		onScreen: () => document.querySelector<HTMLElement>("[data-spool-stage-shown]")?.dataset.spoolStageSlide,
		shown: () => of("stage-shown").map((message) => message.shown),
		slides: () => of("stage-slides").at(-1)?.slides ?? [],
	};
}

const plain = (name: string): ComponentType =>
	function Plain() {
		return createElement("p", null, name);
	};

const statusOf = (on: Stage, frame: string) => on.slides().find((slide) => slide.frame === frame);

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	Reflect.deleteProperty(document, "startViewTransition");
});

it("holds the room's picture off a slide whose stylesheet or picture will not come, names it, and tries again", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	let styleFails = true;
	const decodes = vi.spyOn(HTMLImageElement.prototype, "decode").mockImplementation(function (this: HTMLImageElement) {
		return this.src.endsWith("gone.png") ? Promise.reject(new Error("no picture")) : Promise.resolve();
	});
	const on = await stage(
		[
			{ frame: "talk/a", screen: plain("a") },
			{ frame: "talk/b", screen: plain("b") },
			{ frame: "talk/c", screen: () => createElement("img", { alt: "", src: "/gone.png" }) },
		],
		{ mode: "own", room: true },
		async (frame) => {
			if (frame === "talk/b" && styleFails) throw new Error("the stylesheet for frame talk/b could not be loaded");
		},
	);
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/a"));
	await vi.waitFor(() => {
		expect(statusOf(on, "talk/b")).toMatchObject({
			status: "broken",
			when: "load",
			why: expect.stringMatching(/stylesheet/),
		});
		expect(statusOf(on, "talk/c")).toMatchObject({
			status: "broken",
			when: "load",
			why: expect.stringMatching(/gone\.png/),
		});
	});

	// a step to either holds what the room has, and the next key still moves on
	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.shown().at(-1)).toMatchObject({ at: { slide: 1 }, held: true }));
	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.shown().at(-1)).toMatchObject({ at: { slide: 2 }, held: true }));
	expect(on.onScreen()).toBe("talk/a");

	// asked for again, the picture that comes goes on whole
	decodes.mockResolvedValue(undefined);
	styleFails = false;
	await vi.advanceTimersByTimeAsync(2000);
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/c"));
	await vi.waitFor(() => expect(statusOf(on, "talk/b")?.status).toBe("ready"));
});

it("waits for a picture a slide's effect reaches for before it goes on, and readies it with the slide from then on", async () => {
	const coming = new Set(["/late.png"]);
	const arrived: (() => void)[] = [];
	vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockImplementation(function (this: HTMLImageElement) {
		return !coming.has(new URL(this.src, location.href).pathname);
	});
	vi.spyOn(HTMLImageElement.prototype, "decode").mockImplementation(function (this: HTMLImageElement) {
		const path = new URL(this.src, location.href).pathname;
		return coming.has(path) ? new Promise<void>((resolve) => arrived.push(resolve)) : Promise.resolve();
	});
	function Late() {
		const [src, setSrc] = useState<string | undefined>(undefined);
		useEffect(() => setSrc("/late.png"), []);
		return createElement("img", { alt: "", src });
	}
	const on = await stage(
		[
			{ frame: "talk/a", screen: plain("a") },
			{ frame: "talk/b", screen: Late },
		],
		{ mode: "own", room: true },
	);
	await vi.waitFor(() => expect(statusOf(on, "talk/b")?.status).toBe("ready"));

	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(arrived.length).toBeGreaterThan(0));
	expect(on.onScreen()).toBe("talk/a");
	expect(on.shown()).toHaveLength(1);

	coming.clear();
	for (const resolve of arrived) resolve();
	await vi.waitFor(() => expect(on.shown().at(-1)).toMatchObject({ at: { slide: 1 }, ready: false, held: false }));
	expect(on.onScreen()).toBe("talk/b");

	// readied with its picture now: back and on again is a step to a ready slide
	on.send({ spool: "stage-command", command: { kind: "back" } });
	await vi.waitFor(() => expect(on.shown().at(-1)?.at.slide).toBe(0));
	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.shown().at(-1)).toMatchObject({ at: { slide: 1 } }));
	expect(on.shown().at(-1)?.ready).toBe(true);
});

it("stops a slide that throws from a handler where it stands, its last picture kept, and the talk moves on", async () => {
	function Ticking() {
		const [count, setCount] = useState(0);
		useEffect(() => {
			const timer = setInterval(() => setCount((now) => now + 1), 5);
			return () => clearInterval(timer);
		}, []);
		return createElement("p", { className: "count" }, String(count));
	}
	const on = await stage(
		[
			{ frame: "talk/a", screen: Ticking, live: true },
			{ frame: "talk/b", screen: plain("b") },
		],
		{ mode: "own", room: true },
	);
	await vi.waitFor(() => expect(Number(document.querySelector(".count")?.textContent)).toBeGreaterThan(2));

	window.dispatchEvent(new ErrorEvent("error", { error: new Error("a handler threw") }));
	await vi.waitFor(() =>
		expect(statusOf(on, "talk/a")).toMatchObject({ status: "broken", when: "later", kept: "picture" }),
	);
	const kept = document.querySelector("[data-spool-stage-shown] .count")?.textContent;
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(document.querySelector("[data-spool-stage-shown] .spool-stage-kept .count")?.textContent).toBe(kept);

	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/b"));
});

it("never lets a mirror's slide change the talk's state on its own, but keeps a default the talk never had", async () => {
	const talk = [
		{ frame: "talk/a", beats: 1, live: true },
		{ frame: "talk/b", beats: 1, live: false },
	];
	function Counting() {
		const state = useTalkState();
		useEffect(() => {
			writeState({ ...stateNow, count: Number(stateNow.count) + 1, seen: true });
		}, []);
		return createElement("p", { className: "count" }, String(state.count));
	}
	const on = await stage(
		[
			{ frame: "talk/a", screen: Counting, live: true },
			{ frame: "talk/b", screen: plain("b") },
		],
		{ mode: "follow", room: true, session: openSession(talk, { slide: 0, beat: 0 }, { count: 1 }) },
	);
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/a"));
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(document.querySelector("[data-spool-stage-shown] .count")?.textContent).toBe("1");
	expect(on.state()).toEqual({ count: 1, seen: true });
});

it("keeps every slide it readied ready, so a jump far across the talk is on at once", async () => {
	const names = ["a", "b", "c", "d", "e", "f"];
	const on = await stage(
		names.map((name) => ({ frame: `talk/${name}`, screen: plain(name) })),
		{ mode: "own", room: true },
	);
	await vi.waitFor(() => expect(on.slides().map((slide) => slide.status)).toEqual(names.map(() => "ready")));
	on.send({ spool: "stage-command", command: { kind: "last" } });
	await vi.waitFor(() => expect(on.shown().at(-1)?.at.slide).toBe(5));
	expect(on.shown().at(-1)).toMatchObject({ ready: true, held: false });
});

it("keeps the room's picture when the slide it dissolves to throws on its new beat before the dissolve begins", async () => {
	// a dissolve's change is made a frame after it is asked for, as a browser's view transition makes it
	Object.defineProperty(document, "startViewTransition", {
		configurable: true,
		value: (update: () => Promise<void>) => {
			const changed = new Promise((resolve) => setTimeout(resolve, 20)).then(update);
			return { updateCallbackDone: changed, ready: changed, finished: changed, skipTransition() {} };
		},
	});
	function ThrowsOnBoom() {
		if (useBeats(["fine", "boom"]).name === "boom") throw new Error("this slide throws on its second beat");
		return createElement("p", null, "c");
	}
	const on = await stage(
		[
			{ frame: "talk/a", screen: plain("a") },
			{ frame: "talk/b", screen: plain("b") },
			{ frame: "talk/c", screen: ThrowsOnBoom, beats: 2 },
		],
		{ mode: "own", room: true },
	);
	await vi.waitFor(() => expect(on.slides().map((slide) => slide.status)).toEqual(["ready", "ready", "ready"]));

	on.send({ spool: "stage-command", command: { kind: "go", slide: 2, beat: 1 } });
	await vi.waitFor(() => expect(on.shown().at(-1)).toMatchObject({ at: { slide: 2, beat: 1 }, held: true }));
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(on.onScreen()).toBe("talk/a");
});
