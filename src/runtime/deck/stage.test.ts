// @vitest-environment happy-dom
import {
	type ComponentType,
	createElement,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
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
	open: { mode: "own" | "follow"; room: boolean; session?: StageSession; webgl?: number; still?: true },
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
			{ frame: "talk/b", screen: plain("b") },
			{ frame: "talk/c", screen: Late },
		],
		{ mode: "own", room: true },
	);
	// a jump past the slide put on ahead: its effects run only as it goes on
	await vi.waitFor(() => expect(statusOf(on, "talk/c")?.status).toBe("ready"));

	on.send({ spool: "stage-command", command: { kind: "go", slide: 2, beat: 0 } });
	await vi.waitFor(() => expect(arrived.length).toBeGreaterThan(0));
	expect(on.onScreen()).toBe("talk/a");
	expect(on.shown()).toHaveLength(1);

	coming.clear();
	for (const resolve of arrived) resolve();
	await vi.waitFor(() => expect(on.shown().at(-1)).toMatchObject({ at: { slide: 2 }, ready: false, held: false }));
	expect(on.onScreen()).toBe("talk/c");

	// readied with its picture now: back and on again is a step to a ready slide
	on.send({ spool: "stage-command", command: { kind: "back" } });
	await vi.waitFor(() => expect(on.shown().at(-1)?.at.slide).toBe(1));
	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.shown().at(-1)).toMatchObject({ at: { slide: 2 } }));
	expect(on.shown().at(-1)?.ready).toBe(true);
});

it("stops a slide that throws from a handler where it stands, its last picture kept, and the talk moves on, but plays on through the browser's notices", async () => {
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

	// what a ResizeObserver could not deliver in one frame comes in the next: nothing threw
	window.dispatchEvent(
		new ErrorEvent("error", { message: "ResizeObserver loop completed with undelivered notifications." }),
	);
	const ticked = Number(document.querySelector(".count")?.textContent);
	await vi.waitFor(() => expect(Number(document.querySelector(".count")?.textContent)).toBeGreaterThan(ticked + 2));
	expect(statusOf(on, "talk/a")?.status).toBe("ready");

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

it("keeps the room's picture when the slide it dissolves to throws on its new beat before the dissolve begins, and says which way each move went", async () => {
	// a dissolve's change is made a frame after it is asked for, as a browser's view transition makes it
	const types: string[][] = [];
	Object.defineProperty(document, "startViewTransition", {
		configurable: true,
		value: (asked: { update: () => Promise<void>; types: string[] }) => {
			types.push(asked.types);
			const changed = new Promise((resolve) => setTimeout(resolve, 20)).then(asked.update);
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

	// and each move tells the slides' CSS which way the talk went, as the player's walks do
	on.send({ spool: "stage-command", command: { kind: "go", slide: 1, beat: 0 } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/b"));
	on.send({ spool: "stage-command", command: { kind: "go", slide: 0, beat: 0 } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/a"));
	expect(types).toEqual([["forward"], ["forward"], ["back"]]);
});

/** WebGL as a browser gives it: a context per canvas, alive until the page gives it back or the browser takes it. */
function fakeWebgl() {
	const lost = new Map<HTMLCanvasElement, boolean>();
	const draws = new Map<HTMLCanvasElement, number>();
	const alive = () => [...lost.values()].filter((gone) => !gone).length;
	let most = 0;
	const take = (canvas: HTMLCanvasElement) => {
		lost.set(canvas, true);
		canvas.dispatchEvent(new Event("webglcontextlost"));
	};
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
		if (!lost.has(this)) lost.set(this, false);
		most = Math.max(most, alive());
		return {
			isContextLost: () => lost.get(this) === true,
			getExtension: () => ({ loseContext: () => take(this) }),
			getContextAttributes: () => ({ preserveDrawingBuffer: true }),
			drawArrays: () => draws.set(this, (draws.get(this) ?? 0) + 1),
		} as never;
	});
	return {
		alive,
		/** the most contexts alive at once */
		most: () => most,
		/** how many times the canvases of a slide have drawn */
		drawn: (frame: string) =>
			[...document.querySelectorAll<HTMLCanvasElement>(`[data-spool-stage-slide="${frame}"] canvas`)].reduce(
				(sum, canvas) => sum + (draws.get(canvas) ?? 0),
				0,
			),
		take,
		/** the slide on screen draws on a context it still has */
		drawing: () => {
			const canvas = document.querySelector<HTMLCanvasElement>("[data-spool-stage-shown] canvas");
			return canvas !== null && lost.get(canvas) === false;
		},
	};
}

function DrawsWithWebgl() {
	const canvas = useRef<HTMLCanvasElement>(null);
	useLayoutEffect(() => {
		canvas.current?.getContext("webgl");
	}, []);
	return createElement("canvas", { ref: canvas });
}

it("keeps every slide that draws with WebGL ready, only those nearest the one on screen holding contexts, so none goes on blank or late", async () => {
	const webgl = fakeWebgl();
	const names = ["a", "b", "c", "d", "e", "f", "g", "h"];
	const on = await stage(
		names.map((name) => ({ frame: `talk/${name}`, screen: DrawsWithWebgl })),
		{ mode: "own", room: true, webgl: 4 },
	);
	for (const [slide, name] of names.entries()) {
		if (slide > 0) on.send({ spool: "stage-command", command: { kind: "next" } });
		await vi.waitFor(() => expect(on.onScreen()).toBe(`talk/${name}`));
		expect(webgl.drawing()).toBe(true);
	}
	// the one on screen and the two before, nearest first, leaving the share room for a slide to make its own as it
	// goes on: the rest are given back, never left for the browser to take, and rendered afresh out of sight, ready
	// again without a context until they go on
	await vi.waitFor(() => expect(webgl.alive()).toBe(3));
	await vi.waitFor(() => expect(on.slides().map((slide) => slide.status)).toEqual(names.map(() => "ready")));
	expect(webgl.alive()).toBe(3);

	// the browser takes the one kept behind all the same: it is rendered afresh before it goes on
	const behind = document.querySelector<HTMLCanvasElement>('[data-spool-stage-slide="talk/g"] canvas');
	if (behind === null) throw new Error("the slide behind is not kept");
	webgl.take(behind);
	await vi.waitFor(() => expect(statusOf(on, "talk/g")?.status).toBe("ready"));
	on.send({ spool: "stage-command", command: { kind: "back" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/g"));
	expect(webgl.drawing()).toBe(true);

	// a jump to one given back goes on at once, and draws
	on.send({ spool: "stage-command", command: { kind: "first" } });
	await vi.waitFor(() => expect(on.shown().at(-1)).toMatchObject({ at: { slide: 0 }, ready: true }));
	expect(on.onScreen()).toBe("talk/a");
	expect(webgl.drawing()).toBe(true);
});

/** Where a slide's effects ran, as it says each time they run. */
const whereRan = (ran: string[], name: string, box: { readonly current: Element | null }) =>
	ran.push(`${name} ${box.current?.closest("[data-spool-stage-shown]") ? "on screen" : "out of sight"}`);

it("puts the slide the next key plays on out of sight before the key, its effects run once in all, drawn no more as it goes on", async () => {
	const ran: string[] = [];
	const drawn = new Map<string, number>();
	const counted = (name: string): ComponentType =>
		function Counted() {
			drawn.set(name, (drawn.get(name) ?? 0) + 1);
			const box = useRef<HTMLParagraphElement>(null);
			useEffect(() => {
				whereRan(ran, name, box);
			}, []);
			return createElement("p", { ref: box }, name);
		};
	const on = await stage(
		["a", "b", "c"].map((name) => ({ frame: `talk/${name}`, screen: counted(name) })),
		{ mode: "own", room: true },
	);
	await vi.waitFor(() => expect(ran).toEqual(["a on screen", "b out of sight"]));
	// waiting, nothing in it takes the focus or a click
	expect(document.querySelector('[data-spool-stage-slide="talk/b"]')?.hasAttribute("inert")).toBe(true);
	const before = new Map(drawn);

	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/b"));
	await vi.waitFor(() => expect(ran).toContain("c out of sight"));
	// the step only shows one slide and hides the other: neither is drawn again for it
	expect([drawn.get("a"), drawn.get("b")]).toEqual([before.get("a"), before.get("b")]);
	on.send({ spool: "stage-command", command: { kind: "back" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/a"));
	expect(ran).toEqual(["a on screen", "b out of sight", "c out of sight"]);
});

it("holds a slide waiting out of sight still after its first frame: its WebGL, frames, entrances and sound wait for it to go on", async () => {
	const webgl = fakeWebgl();
	let entrance: Animation | undefined;
	let later: Animation | undefined;
	let sound = null as HTMLMediaElement | null;
	let frames = 0;
	function Spins() {
		const canvas = useRef<HTMLCanvasElement>(null);
		const words = useRef<HTMLParagraphElement>(null);
		const video = useRef<HTMLVideoElement>(null);
		useEffect(() => {
			const gl = canvas.current?.getContext("webgl2");
			let frame = 0;
			const draw = () => {
				frames++;
				gl?.drawArrays(4, 0, 3);
				frame = requestAnimationFrame(draw);
			};
			draw();
			entrance = words.current?.animate([{ opacity: 0 }, { opacity: 1 }], 400);
			// an entrance set off a moment after it mounts
			const soon = setTimeout(() => {
				later = words.current?.animate([{ scale: 0.9 }, { scale: 1 }], 400);
			}, 70);
			sound = video.current;
			void video.current?.play();
			return () => {
				cancelAnimationFrame(frame);
				clearTimeout(soon);
			};
		}, []);
		return createElement(
			"div",
			null,
			createElement("canvas", { ref: canvas }),
			createElement("p", { ref: words }, "b"),
			createElement("video", { ref: video }),
		);
	}
	const on = await stage(
		[
			{ frame: "talk/a", screen: plain("a") },
			{ frame: "talk/b", screen: Spins },
		],
		{ mode: "own", room: true },
	);
	await vi.waitFor(() => expect(webgl.drawn("talk/b")).toBeGreaterThan(0));
	await new Promise((resolve) => setTimeout(resolve, 150));
	const waited = webgl.drawn("talk/b");
	const ran = frames;
	await new Promise((resolve) => setTimeout(resolve, 250));
	expect([webgl.drawn("talk/b"), frames]).toEqual([waited, ran]);
	expect([entrance?.playState, entrance?.currentTime, sound?.paused]).toEqual(["paused", 0, true]);
	expect([later?.playState, later?.currentTime]).toEqual(["paused", 0]);

	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/b"));
	await vi.waitFor(() => expect(webgl.drawn("talk/b")).toBeGreaterThan(waited + 2));
	expect([entrance?.playState, later?.playState, sound?.paused]).toEqual(["running", "running", false]);
});

it("draws each slide a still stage shows once, its entrances played, and then no more: the presenter's next pane", async () => {
	const webgl = fakeWebgl();
	const frames = new Map<string, number>();
	const entrances = new Map<string, Animation | undefined>();
	const spins = (name: string): ComponentType =>
		function Spins() {
			const canvas = useRef<HTMLCanvasElement>(null);
			const words = useRef<HTMLParagraphElement>(null);
			useEffect(() => {
				const gl = canvas.current?.getContext("webgl2");
				let frame = 0;
				const draw = () => {
					frames.set(name, (frames.get(name) ?? 0) + 1);
					gl?.drawArrays(4, 0, 3);
					frame = requestAnimationFrame(draw);
				};
				draw();
				entrances.set(name, words.current?.animate([{ opacity: 0 }, { opacity: 1 }], 400));
				return () => cancelAnimationFrame(frame);
			}, []);
			return createElement(
				"div",
				null,
				createElement("canvas", { ref: canvas }),
				createElement("p", { ref: words }, name),
			);
		};
	const on = await stage(
		["a", "b"].map((name) => ({ frame: `talk/${name}`, screen: spins(name) })),
		{ mode: "own", room: true, still: true },
	);
	const resting = async (name: string) => {
		await vi.waitFor(() => expect(webgl.drawn(`talk/${name}`)).toBeGreaterThan(0));
		await new Promise((resolve) => setTimeout(resolve, 150));
		const drawn = [webgl.drawn(`talk/${name}`), frames.get(name)];
		await new Promise((resolve) => setTimeout(resolve, 250));
		expect([webgl.drawn(`talk/${name}`), frames.get(name)]).toEqual(drawn);
		return drawn[0] ?? 0;
	};
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/a"));
	await resting("a");
	expect(entrances.get("a")?.playState).toBe("finished");
	const waited = await resting("b");

	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/b"));
	// on screen it draws again, as it stands now, and then rests as it did out of sight
	await vi.waitFor(() => expect(webgl.drawn("talk/b")).toBeGreaterThan(waited));
	await resting("b");
	expect(entrances.get("b")?.playState).toBe("finished");
});

it("puts the slide the back key plays on out of sight too, keeps a slide put on as it was, and what it was playing plays again as it goes back on", async () => {
	const ran: string[] = [];
	let sound = null as HTMLMediaElement | null;
	function Plays() {
		const box = useRef<HTMLDivElement>(null);
		const video = useRef<HTMLVideoElement>(null);
		useEffect(() => {
			sound = video.current;
			whereRan(ran, "a", box);
		}, []);
		return createElement("div", { ref: box }, createElement("video", { ref: video }));
	}
	const noted = (name: string): ComponentType =>
		function Noted() {
			const box = useRef<HTMLParagraphElement>(null);
			useEffect(() => {
				whereRan(ran, name, box);
			}, []);
			return createElement("p", { ref: box }, name);
		};
	const on = await stage(
		[
			{ frame: "talk/a", screen: Plays },
			...["b", "c", "d", "e", "f", "g"].map((name) => ({ frame: `talk/${name}`, screen: noted(name) })),
		],
		{ mode: "own", room: true },
	);
	await vi.waitFor(() => expect(ran).toEqual(["a on screen", "b out of sight"]));
	// played from a click, as a talk plays its video
	await sound?.play();
	for (const frame of ["talk/b", "talk/c"]) {
		on.send({ spool: "stage-command", command: { kind: "next" } });
		await vi.waitFor(() => expect(on.onScreen()).toBe(frame));
	}
	expect(sound?.paused).toBe(true);
	// two slides back it is still on as it was put on: going back to it runs nothing in it again
	for (const frame of ["talk/b", "talk/a"]) {
		on.send({ spool: "stage-command", command: { kind: "back" } });
		await vi.waitFor(() => expect(on.onScreen()).toBe(frame));
	}
	expect(ran.filter((one) => one.startsWith("a"))).toEqual(["a on screen"]);
	expect(sound?.paused).toBe(false);

	// a jump past every slide put on: the one the back key plays is put on before the key, so nothing runs as it plays
	// it, and at most four slides wait out of sight, the nearest
	on.send({ spool: "stage-command", command: { kind: "go", slide: 6 } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/g"));
	await vi.waitFor(() => expect(ran).toContain("f out of sight"));
	const waiting = () =>
		[...document.querySelectorAll("[data-spool-stage-waiting]")].map((box) =>
			box.getAttribute("data-spool-stage-slide"),
		);
	await vi.waitFor(() => expect(waiting().sort()).toEqual(["talk/b", "talk/c", "talk/d", "talk/f"]));
	on.send({ spool: "stage-command", command: { kind: "back" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/f"));
	expect(ran.filter((one) => one.startsWith("f"))).toEqual(["f out of sight"]);
});

it("readies nothing while a step plays: what it puts on ahead or lets go waits for the dissolve to end, and a key meanwhile goes first", async () => {
	// a dissolve plays until the test ends it, as a browser's view transition plays for its length
	const playing: (() => void)[] = [];
	Object.defineProperty(document, "startViewTransition", {
		configurable: true,
		value: (asked: { update: () => Promise<void> }) => {
			const changed = new Promise((resolve) => setTimeout(resolve, 10)).then(asked.update);
			const finished = changed.then(() => new Promise<void>((resolve) => playing.push(resolve)));
			return { updateCallbackDone: changed, ready: changed, finished, skipTransition() {} };
		},
	});
	const ran: string[] = [];
	const noted = (name: string): ComponentType =>
		function Noted() {
			const box = useRef<HTMLParagraphElement>(null);
			useEffect(() => {
				whereRan(ran, name, box);
				return () => {
					ran.push(`${name} let go`);
				};
			}, []);
			return createElement("p", { ref: box }, name);
		};
	const names = ["a", "b", "c", "d", "e", "f", "g"];
	const on = await stage(
		names.map((name) => ({ frame: `talk/${name}`, screen: noted(name) })),
		{ mode: "own", room: true },
	);
	const ended = async () => {
		await vi.waitFor(() => expect(playing.length).toBeGreaterThan(0));
		for (const end of playing.splice(0)) end();
	};
	await vi.waitFor(() => expect(ran).toEqual(["a on screen", "b out of sight"]));
	for (const name of ["b", "c", "d"]) {
		on.send({ spool: "stage-command", command: { kind: "next" } });
		await vi.waitFor(() => expect(on.onScreen()).toBe(`talk/${name}`));
		await ended();
	}
	await vi.waitFor(() => expect(ran).toContain("e out of sight"));

	// on e, four slides wait out of sight at most: the one furthest back is let go, once the step to e has played
	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.shown().at(-1)?.at.slide).toBe(4));
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(ran).not.toContain("a let go");
	expect(ran).not.toContain("f out of sight");

	// a key while it plays goes first: its slide goes on, and only then is anything readied
	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.shown().at(-1)?.at.slide).toBe(5));
	await new Promise((resolve) => setTimeout(resolve, 100));
	expect(ran.filter((one) => one.endsWith("let go"))).toEqual([]);
	await ended();
	await vi.waitFor(() => expect(ran).toContain("g out of sight"));
	const readied = ran.slice(ran.indexOf("f on screen") + 1);
	expect(readied).toEqual(expect.arrayContaining(["a let go", "b let go", "g out of sight"]));
});

it("puts a slide on ahead only while its WebGL contexts fit the stage's share: one that does not makes them as it goes on", async () => {
	const webgl = fakeWebgl();
	const ran: string[] = [];
	const drawsWith = (name: string, contexts: number): ComponentType =>
		function Draws() {
			const box = useRef<HTMLDivElement>(null);
			useEffect(() => {
				for (const canvas of box.current?.querySelectorAll("canvas") ?? []) canvas.getContext("webgl2");
				whereRan(ran, name, box);
			}, []);
			return createElement(
				"div",
				{ ref: box },
				...Array.from({ length: contexts }, (_, at) => createElement("canvas", { key: at })),
			);
		};
	const on = await stage(
		[
			{ frame: "talk/a", screen: drawsWith("a", 1) },
			{ frame: "talk/b", screen: drawsWith("b", 2) },
			{ frame: "talk/c", screen: drawsWith("c", 3) },
		],
		{ mode: "own", room: true, webgl: 3 },
	);
	await vi.waitFor(() => expect(ran).toEqual(["a on screen", "b out of sight"]));
	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/b"));
	// c is tried ahead once, holds more than is left beside b, and is let go: it is what it costs from now on
	await vi.waitFor(() => expect(ran).toContain("c out of sight"));
	await vi.waitFor(() => expect(webgl.alive()).toBeLessThanOrEqual(3));
	// refused a context past the share as it tried: never were more alive than the share, to learn what it costs
	expect(webgl.most()).toBeLessThanOrEqual(3);
	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/c"));
	expect(ran.filter((one) => one.startsWith("c"))).toEqual(["c out of sight", "c on screen"]);

	// round again: b goes on ahead as before, and c only as it goes on
	on.send({ spool: "stage-command", command: { kind: "first" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/a"));
	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/b"));
	await new Promise((resolve) => setTimeout(resolve, 300));
	on.send({ spool: "stage-command", command: { kind: "next" } });
	await vi.waitFor(() => expect(on.onScreen()).toBe("talk/c"));
	expect(ran.filter((one) => one.startsWith("c"))).toEqual(["c out of sight", "c on screen", "c on screen"]);
	await vi.waitFor(() => expect(webgl.alive()).toBeLessThanOrEqual(3));
	// what each costs is said with its readiness, for the presenter to name the slide that goes on late
	expect(on.slides().map((slide) => slide.webgl)).toEqual([1, 2, 3]);
});
