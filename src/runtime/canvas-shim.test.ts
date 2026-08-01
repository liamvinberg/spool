// @vitest-environment happy-dom

import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeApp, makeProject, makeTempDir, writeFrame } from "../test-helpers";

/**
 * The canvas shim rides every served frame document as a classic script so it
 * holds native references before any module evaluates. HTML frames keep running
 * when Select owns the pointer. Here the served shim is extracted from a real
 * document and run in the happy-dom realm — its answers are behavior, not text.
 */

const frameTsx = `export default function Frame() {
	return <p>shim host</p>;
}
`;

async function servedShim(): Promise<string> {
	const spoolDir = join(makeTempDir(), ".spool");
	const { root, name } = makeProject(spoolDir);
	writeFrame(root, "host", frameTsx);
	const app = makeApp(spoolDir);
	const doc = await (await app.request(`/p/${name}/frames/host`)).text();
	const shim = doc.match(/<script>((?:(?!<\/script>)[\s\S])*requestAnimationFrame[\s\S]*?)<\/script>/)?.[1];
	expect(shim, "the canvas shim script in the served document").toBeDefined();
	return shim as string;
}

function runShim(shim: string): () => void {
	// a classic script in the document realm: window-bound, module-free
	const addEventListener = window.addEventListener.bind(window);
	const listeners: Array<{
		type: string;
		listener: EventListenerOrEventListenerObject;
		options: boolean | AddEventListenerOptions | undefined;
	}> = [];
	window.addEventListener = ((
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: boolean | AddEventListenerOptions,
	) => {
		if (listener === null) return;
		listeners.push({ type, listener, options });
		if (options === undefined) addEventListener(type, listener);
		else addEventListener(type, listener, options);
	}) as typeof window.addEventListener;
	// the shim owns rAF for the freeze (#171); one realm serves every test here,
	// so its wrapper comes back off with its listeners
	const raf = window.requestAnimationFrame;
	const cancelRaf = window.cancelAnimationFrame;
	new Function(shim)();
	window.addEventListener = addEventListener;
	return () => {
		window.requestAnimationFrame = raf;
		window.cancelAnimationFrame = cancelRaf;
		for (const { type, listener, options } of listeners) {
			if (options === undefined) window.removeEventListener(type, listener);
			else window.removeEventListener(type, listener, options);
		}
	};
}

/** One message hop plus a couple of animation frames — enough for either to land. */
function beat(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 50));
}

/** The next reply of one spool kind — parent === window here, so it echoes back. */
function nextReply(kind: string): Promise<unknown> {
	return new Promise((resolve) => {
		const onMessage = (event: MessageEvent) => {
			const data = event.data as { spool?: string } | null;
			if (data === null || typeof data !== "object" || data.spool !== kind) return;
			window.removeEventListener("message", onMessage);
			resolve(data);
		};
		window.addEventListener("message", onMessage);
	});
}

const nextPicked = () => nextReply("picked");
const nextSiteBoxes = () => nextReply("site-boxes") as Promise<{ boxes: Record<string, unknown> }>;

/** happy-dom lays nothing out, so a box a test wants to read has to be given one. */
function layOut(selector: string, box: { x: number; y: number; w: number; h: number }): void {
	const el = document.querySelector(selector);
	expect(el, selector).not.toBeNull();
	(el as Element).getBoundingClientRect = (() => ({
		x: box.x,
		y: box.y,
		width: box.w,
		height: box.h,
		top: box.y,
		left: box.x,
		right: box.x + box.w,
		bottom: box.y + box.h,
	})) as unknown as Element["getBoundingClientRect"];
}

/**
 * The frame's own viewport, which is the frame: one realm serves every test
 * here, so the size a test needs comes back off afterwards.
 */
function seeThrough(width: number, height: number): void {
	const was = { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
	const set = (size: { innerWidth: number; innerHeight: number }) => {
		Object.defineProperty(window, "innerWidth", { configurable: true, value: size.innerWidth });
		Object.defineProperty(window, "innerHeight", { configurable: true, value: size.innerHeight });
	};
	set({ innerWidth: width, innerHeight: height });
	onTestFinished(() => set(was));
}

describe("the canvas shim", () => {
	it("relays Meta hold changes without claiming the frame's own shortcuts", async () => {
		const shim = await servedShim();
		const posted: unknown[] = [];
		const parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
		Object.defineProperty(window, "parent", {
			configurable: true,
			value: { postMessage: (message: unknown) => posted.push(message) },
		});
		window.__SPOOL__ = { project: "project", frame: "host", projectCapability: "project-capability" };
		let dispose: (() => void) | undefined;

		try {
			dispose = runShim(shim);
			const child = document.createElement("div");
			document.body.append(child);
			child.addEventListener("keydown", (event) => event.stopPropagation());
			child.addEventListener("keyup", (event) => event.stopPropagation());
			child.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Meta" }));
			child.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, metaKey: true, key: "v" }));
			child.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, metaKey: true, key: "h" }));
			child.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Meta" }));
			// the shim names the key it saw rather than assuming ⌘: off the Mac,
			// ctrl is the accel modifier and the canvas is what knows that
			child.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Control" }));
			child.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Control" }));
			window.dispatchEvent(new Event("blur"));

			expect(posted).toEqual([
				{ spool: "modifier", frame: "host", modifier: "Meta", held: true },
				{ spool: "modifier", frame: "host", modifier: "Meta", held: false },
				{ spool: "modifier", frame: "host", modifier: "Control", held: true },
				{ spool: "modifier", frame: "host", modifier: "Control", held: false },
				// blur releases both candidates so neither platform's can stick
				{ spool: "modifier", frame: "host", modifier: "Meta", held: false },
				{ spool: "modifier", frame: "host", modifier: "Control", held: false },
			]);
		} finally {
			dispose?.();
			delete window.__SPOOL__;
			if (parentDescriptor !== undefined) Object.defineProperty(window, "parent", parentDescriptor);
		}
	});

	it("claims canvas zoom gestures that start inside an entered frame", async () => {
		const shim = await servedShim();
		const posted: unknown[] = [];
		const parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
		Object.defineProperty(window, "parent", {
			configurable: true,
			value: { postMessage: (message: unknown) => posted.push(message) },
		});
		window.__SPOOL__ = { project: "project", frame: "host", projectCapability: "project-capability" };
		let dispose: (() => void) | undefined;

		try {
			dispose = runShim(shim);

			const pinch = new WheelEvent("wheel", {
				bubbles: true,
				cancelable: true,
				deltaY: -20,
			});
			// happy-dom's WheelEvent omits the MouseEvent modifier/point fields.
			Object.defineProperties(pinch, {
				ctrlKey: { value: true },
				clientX: { value: 12 },
				clientY: { value: 34 },
			});
			window.dispatchEvent(pinch);

			const shortcut = new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				metaKey: true,
				key: "+",
			});
			window.dispatchEvent(shortcut);
			const browserReset = new KeyboardEvent("keydown", {
				bubbles: true,
				cancelable: true,
				metaKey: true,
				key: "0",
			});
			window.dispatchEvent(browserReset);

			expect(pinch.defaultPrevented, "pinch must not become browser page zoom").toBe(true);
			expect(shortcut.defaultPrevented, "shortcut must not become browser page zoom").toBe(true);
			expect(browserReset.defaultPrevented, "browser reset must remain an escape hatch").toBe(false);
			expect(posted).toEqual([
				{ spool: "zoom", frame: "host", kind: "wheel", x: 12, y: 34, deltaY: -20, deltaMode: 0 },
				{ spool: "zoom", frame: "host", kind: "in" },
			]);
		} finally {
			dispose?.();
			delete window.__SPOOL__;
			if (parentDescriptor !== undefined) Object.defineProperty(window, "parent", parentDescriptor);
		}
	});

	it("relays the jump chords and eats the browser's open-file dialog", async () => {
		const shim = await servedShim();
		const posted: unknown[] = [];
		const parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
		Object.defineProperty(window, "parent", {
			configurable: true,
			value: { postMessage: (message: unknown) => posted.push(message) },
		});
		window.__SPOOL__ = { project: "project", frame: "host", projectCapability: "project-capability" };
		let dispose: (() => void) | undefined;

		try {
			dispose = runShim(shim);

			const back = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ctrlKey: true, key: "o" });
			window.dispatchEvent(back);
			const forward = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ctrlKey: true, key: "i" });
			window.dispatchEvent(forward);
			// without the modifier the key is the frame's own, untouched
			const plain = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "o" });
			window.dispatchEvent(plain);

			expect(back.defaultPrevented, "⌃O must not become the browser's open-file dialog").toBe(true);
			expect(forward.defaultPrevented).toBe(true);
			expect(plain.defaultPrevented).toBe(false);
			expect(posted).toEqual([
				{ spool: "key", frame: "host", key: "ctrl+o" },
				{ spool: "key", frame: "host", key: "ctrl+i" },
			]);
		} finally {
			dispose?.();
			delete window.__SPOOL__;
			if (parentDescriptor !== undefined) Object.defineProperty(window, "parent", parentDescriptor);
		}
	});

	it("keeps the middle-button drag for the canvas and leaves every other button to the frame", async () => {
		const shim = await servedShim();
		const posted: unknown[] = [];
		const parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
		Object.defineProperty(window, "parent", {
			configurable: true,
			value: { postMessage: (message: unknown) => posted.push(message) },
		});
		window.__SPOOL__ = { project: "project", frame: "host", projectCapability: "project-capability" };
		let dispose: (() => void) | undefined;

		try {
			dispose = runShim(shim);
			const press = (button: number, screenX: number, screenY: number) =>
				new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button, screenX, screenY });

			// a primary press is the app's own and must reach it untouched
			const primary = press(0, 10, 10);
			window.dispatchEvent(primary);
			expect(primary.defaultPrevented, "the frame owns its own clicks").toBe(false);

			const middle = press(1, 100, 200);
			window.dispatchEvent(middle);
			window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, screenX: 130, screenY: 180 }));
			window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 1 }));
			// a move after the release belongs to nobody
			window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, screenX: 999, screenY: 999 }));

			expect(middle.defaultPrevented, "middle-drag must not become browser autoscroll").toBe(true);
			expect(posted).toEqual([
				{ spool: "pan", frame: "host", phase: "start", x: 100, y: 200 },
				{ spool: "pan", frame: "host", phase: "move", x: 130, y: 180 },
				{ spool: "pan", frame: "host", phase: "end", x: 0, y: 0 },
			]);
		} finally {
			dispose?.();
			delete window.__SPOOL__;
			if (parentDescriptor !== undefined) Object.defineProperty(window, "parent", parentDescriptor);
		}
	});

	it("holds the frame's animation frames while the camera moves, and drops none", async () => {
		const shim = await servedShim();
		const dispose = runShim(shim);
		const ticks: number[] = [];
		let stopped = false;

		try {
			const loop = (time: number) => {
				if (stopped) return;
				ticks.push(time);
				window.requestAnimationFrame(loop);
			};
			window.requestAnimationFrame(loop);
			await beat();
			expect(ticks.length, "the loop is the frame's own while the camera rests").toBeGreaterThan(0);

			window.postMessage({ spool: "freeze", on: true }, "*");
			await beat();
			const atFreeze = ticks.length;
			// a callback asked for and taken back while frozen is gone for good
			let cancelled = 0;
			window.cancelAnimationFrame(
				window.requestAnimationFrame(() => {
					cancelled++;
				}),
			);
			await beat();
			expect(ticks.length, "a frozen frame runs no animation frames").toBe(atFreeze);

			window.postMessage({ spool: "freeze", on: false }, "*");
			await beat();
			expect(ticks.length, "the held callback comes back — a lost one never animates again").toBeGreaterThan(
				atFreeze,
			);
			expect(cancelled).toBe(0);
		} finally {
			stopped = true;
			dispose();
		}
	});

	it("holds the animation clock with the frames, so a thawed loop resumes instead of leaping", async () => {
		const shim = await servedShim();
		const dispose = runShim(shim);
		const ticks: number[] = [];
		let stopped = false;

		try {
			const loop = (time: number) => {
				if (stopped) return;
				ticks.push(time);
				window.requestAnimationFrame(loop);
			};
			window.requestAnimationFrame(loop);
			await beat();

			window.postMessage({ spool: "freeze", on: true }, "*");
			await beat();
			const atFreeze = ticks.length;
			// long enough that a real-time timestamp would be unmistakable
			await new Promise((resolve) => setTimeout(resolve, 300));
			window.postMessage({ spool: "freeze", on: false }, "*");
			await beat();

			const last = ticks[atFreeze - 1] ?? 0;
			const first = ticks[atFreeze] ?? 0;
			expect(ticks.length, "the loop runs again after the thaw").toBeGreaterThan(atFreeze);
			// a loop that integrates time - last would otherwise take the whole
			// freeze in one step and land wherever a third of a second put it
			expect(first - last, "the thawed frame is an ordinary frame's delta later").toBeLessThan(100);
			expect(first, "the clock holds, and never runs backwards").toBeGreaterThanOrEqual(last);
		} finally {
			stopped = true;
			dispose();
		}
	});

	it("pauses the frame's declarative animations for the freeze and plays back only those", async () => {
		const shim = await servedShim();
		const dispose = runShim(shim);
		const getAnimations = document.getAnimations;
		const log: string[] = [];
		const running = {
			playState: "running",
			pause: () => {
				running.playState = "paused";
				log.push("pause");
			},
			play: () => {
				running.playState = "running";
				log.push("play");
			},
		};
		// already paused by the frame itself: the freeze did not stop it, so the
		// thaw has no business starting it
		const idle = {
			playState: "paused",
			pause: () => log.push("pause-idle"),
			play: () => log.push("play-idle"),
		};
		document.getAnimations = (() => [running, idle]) as unknown as typeof document.getAnimations;

		try {
			window.postMessage({ spool: "freeze", on: true }, "*");
			await beat();
			expect(running.playState).toBe("paused");

			window.postMessage({ spool: "freeze", on: false }, "*");
			await beat();
			expect(log).toEqual(["pause", "play"]);
		} finally {
			document.getAnimations = getAnimations;
			dispose();
		}
	});

	it("answers a pick with the ancestry down to the element at the point", async () => {
		const shim = await servedShim();
		runShim(shim);
		document.body.innerHTML = `<div id="root"><main data-spool-source="frames/host/frame.tsx:3:3">
			<button class="pay" data-spool-source="frames/host/frame.tsx:4:4">Pay now</button>
			<ul data-spool-source="frames/host/frame.tsx:6:4"><li>a</li><li>b</li></ul>
		</main></div>`;

		const button = document.querySelector("button") as Element;
		document.elementFromPoint = () => button;
		const picked = nextPicked();
		window.postMessage({ spool: "pick", x: 10, y: 20, id: 7 }, "*");

		const reply = (await picked) as { id: number; chain: Array<Record<string, unknown>> };
		expect(reply.id).toBe(7);
		expect(reply.chain).toHaveLength(2);
		expect(reply.chain[0]).toMatchObject({
			selector: "main",
			tag: "main",
			source: "frames/host/frame.tsx:3:3",
			generated: false,
		});
		expect(reply.chain[1]).toMatchObject({
			selector: "main > button",
			tag: "button",
			source: "frames/host/frame.tsx:4:4",
			generated: false,
		});
		expect(reply.chain[1]?.rect).toEqual({ x: 0, y: 0, w: 0, h: 0 });
	});

	it("degrades an unstamped element to its nearest stamped ancestor", async () => {
		const shim = await servedShim();
		runShim(shim);
		document.body.innerHTML = `<div id="root"><main data-spool-source="frames/host/frame.tsx:3:3">
			<ul data-spool-source="frames/host/frame.tsx:6:4"><li>a</li><li>b</li></ul>
		</main></div>`;

		const second = document.querySelectorAll("li")[1] as Element;
		document.elementFromPoint = () => second;
		const picked = nextPicked();
		window.postMessage({ spool: "pick", x: 1, y: 1 }, "*");

		const reply = (await picked) as { chain: Array<Record<string, unknown>> };
		expect(reply.chain).toHaveLength(3);
		expect(reply.chain[2]).toMatchObject({
			selector: "main > ul > li:nth-of-type(2)",
			outerHtml: "<li>b</li>",
			source: "frames/host/frame.tsx:6:4",
			generated: true,
		});
	});

	it("answers an empty chain for the frame background and missing hits", async () => {
		const shim = await servedShim();
		runShim(shim);
		document.body.innerHTML = `<div id="root"><p>content</p></div>`;

		document.elementFromPoint = () => null;
		let picked = nextPicked();
		window.postMessage({ spool: "pick", x: 1, y: 1 }, "*");
		expect(((await picked) as { chain: unknown }).chain).toEqual([]);

		document.elementFromPoint = () => document.getElementById("root");
		picked = nextPicked();
		window.postMessage({ spool: "pick", x: 1, y: 1 }, "*");
		expect(((await picked) as { chain: unknown }).chain).toEqual([]);
	});

	it("answers a range anchor with the union of every stamp inside it (#214)", async () => {
		const shim = await servedShim();
		runShim(shim);
		document.body.innerHTML = `<div id="root"><main data-spool-source="frames/host/frame.tsx:3:2">
			<h1 data-spool-source="frames/host/frame.tsx:4:3">kaffe</h1>
			<p data-spool-source="frames/host/frame.tsx:5:3">open until six</p>
			<footer data-spool-source="frames/host/frame.tsx:9:3">closed sundays</footer>
			<aside data-spool-source="shared/ui/badge.tsx:2:2">new</aside>
		</main></div>`;
		layOut("main", { x: 0, y: 0, w: 400, h: 600 });
		layOut("h1", { x: 20, y: 20, w: 200, h: 40 });
		layOut("p", { x: 20, y: 70, w: 360, h: 24 });
		layOut("footer", { x: 20, y: 500, w: 360, h: 30 });
		layOut("aside", { x: 300, y: 20, w: 60, h: 20 });

		const boxes = nextSiteBoxes();
		window.postMessage(
			{
				spool: "sites",
				id: 4,
				sites: [
					// two stamps and the element that holds them: the union is the block
					{ path: "frames/host/frame.tsx", line: 4, col: 0, through: 5 },
					// another file's stamps are another file's, whatever line they are on
					{ path: "shared/ui/badge.tsx", line: 1, col: 0, through: 4 },
					// a range nothing on screen came from has no box, and no fallback
					{ path: "frames/host/frame.tsx", line: 40, col: 0, through: 44 },
					// the point form is untouched by any of it
					{ path: "frames/host/frame.tsx", line: 9, col: 3 },
				],
			},
			"*",
		);

		expect((await boxes).boxes).toEqual({
			"frames/host/frame.tsx:4-5": { x: 20, y: 20, w: 360, h: 74 },
			"shared/ui/badge.tsx:1-4": { x: 300, y: 20, w: 60, h: 20 },
			"frames/host/frame.tsx:40-44": null,
			"frames/host/frame.tsx:9:3": { x: 20, y: 500, w: 360, h: 30 },
		});
	});

	it("clips a range anchor to the frame it was measured in (#222)", async () => {
		const shim = await servedShim();
		onTestFinished(runShim(shim));
		// the frame is the viewport of its own document, and a union answers in
		// that document's coordinates
		seeThrough(390, 844);
		document.body.innerHTML = `<div id="root"><main data-spool-source="frames/host/frame.tsx:1:1">
			<h1 data-spool-source="frames/host/frame.tsx:2:2">kaffe</h1>
			<p data-spool-source="frames/host/frame.tsx:8:2">open until six</p>
			<footer data-spool-source="frames/host/frame.tsx:20:2">closed sundays</footer>
		</main></div>`;
		// a page longer and wider than the frame showing it, which is most of them
		layOut("main", { x: -20, y: 0, w: 440, h: 2400 });
		layOut("h1", { x: 20, y: 20, w: 200, h: 40 });
		layOut("p", { x: 20, y: 800, w: 350, h: 120 });
		layOut("footer", { x: 20, y: 1600, w: 350, h: 40 });

		const boxes = nextSiteBoxes();
		window.postMessage(
			{
				spool: "sites",
				id: 5,
				sites: [
					// a whole-file rewrite really is the whole frame, and no more of it
					{ path: "frames/host/frame.tsx", line: 1, col: 0, through: 99 },
					// a block that runs off the bottom edge is marked as far as it shows
					{ path: "frames/host/frame.tsx", line: 8, col: 0, through: 8 },
					// and one that landed entirely below the fold is no mark at all
					{ path: "frames/host/frame.tsx", line: 20, col: 0, through: 20 },
					// the point form anchors an arrow rather than marking a frame, so it
					// keeps answering where the element is
					{ path: "frames/host/frame.tsx", line: 20, col: 2 },
				],
			},
			"*",
		);

		expect((await boxes).boxes).toEqual({
			"frames/host/frame.tsx:1-99": { x: 0, y: 0, w: 390, h: 844 },
			"frames/host/frame.tsx:8-8": { x: 20, y: 800, w: 350, h: 44 },
			"frames/host/frame.tsx:20-20": null,
			"frames/host/frame.tsx:20:2": { x: 20, y: 1600, w: 350, h: 40 },
		});
	});

	it("leaves the frame's own timers alone, and its frames alone until a freeze", async () => {
		// The shim once wrapped rAF *and* setInterval to pause held HTML: the
		// cooperative pause #131 rejected, because those documents keep running.
		// #171 reinstates the narrow half — rAF, gated by nothing but a camera in
		// motion, and passed straight through the rest of the time.
		const shim = await servedShim();
		const nativeInterval = window.setInterval;
		const dispose = runShim(shim);

		try {
			expect(window.setInterval).toBe(nativeInterval);
			const fired = await new Promise<boolean>((resolve) => {
				window.requestAnimationFrame(() => resolve(true));
				setTimeout(() => resolve(false), 200);
			});
			expect(fired, "an unfrozen frame's animation frames are the frame's own").toBe(true);
		} finally {
			dispose();
		}
	});
});
