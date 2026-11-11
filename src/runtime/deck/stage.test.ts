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
			slides: slides.map(({ frame, live }) => ({ frame, beats: 1, live: live === true, w: 160, h: 90 })),
		},
	};
	document.body.innerHTML = '<div id="root"></div>';
	const { bootStage } = await import("./stage");
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
