// @vitest-environment happy-dom

import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeApp, makeProject, makeTempDir, writeFrame } from "../test-helpers";

/**
 * The canvas shim rides every served frame document as a classic script so it
 * holds native references before any module evaluates. It does not stop time:
 * a held frame is frozen by `content-visibility: hidden` on the canvas side
 * (#112), at engine level. Here the served shim is extracted from a real
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
	new Function(shim)();
	window.addEventListener = addEventListener;
	return () => {
		for (const { type, listener, options } of listeners) {
			if (options === undefined) window.removeEventListener(type, listener);
			else window.removeEventListener(type, listener, options);
		}
	};
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
			window.dispatchEvent(new Event("blur"));

			expect(posted).toEqual([
				{ spool: "modifier", frame: "host", modifier: "Meta", held: true },
				{ spool: "modifier", frame: "host", modifier: "Meta", held: false },
				{ spool: "modifier", frame: "host", modifier: "Meta", held: false },
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

	it("walks the live DOM below the boot root, each element with its own stamp and name", async () => {
		const shim = await servedShim();
		runShim(shim);
		document.body.innerHTML = `<div id="root"><main data-spool-source="frames/host/frame.tsx:3:3">
			<h1 data-spool-source="frames/host/frame.tsx:4:4">Din varukorg</h1>
			<button aria-label="Close" data-spool-source="frames/host/frame.tsx:5:4"><span></span></button>
		</main></div>`;

		const walked = nextReply("tree");
		window.postMessage({ spool: "tree?", id: 3 }, "*");

		const reply = (await walked) as { id: number; roots: Array<Record<string, unknown>> };
		expect(reply.id).toBe(3);
		expect(reply.roots).toHaveLength(1);
		const main = reply.roots[0] as { tag: string; text: string; children: Array<Record<string, unknown>> };
		expect(main).toMatchObject({ tag: "main", selector: "main", source: "frames/host/frame.tsx:3:3" });
		// a wrapper never wears its descendants' words
		expect(main.text).toBe("");
		expect(main.children[0]).toMatchObject({ tag: "h1", text: "Din varukorg", label: "" });
		// no words of its own: the accessible label its author wrote names it
		expect(main.children[1]).toMatchObject({ tag: "button", text: "", label: "Close" });
	});

	it("describes each selector's ancestry so rail rows become canvas selections", async () => {
		const shim = await servedShim();
		runShim(shim);
		document.body.innerHTML = `<div id="root"><main data-spool-source="frames/host/frame.tsx:3:3">
			<ul data-spool-source="frames/host/frame.tsx:6:4"><li>a</li><li>b</li></ul>
		</main></div>`;

		const described = nextReply("described");
		window.postMessage(
			{ spool: "describe", selectors: ["main > ul > li:nth-of-type(2)", "main > ghost"], id: 9 },
			"*",
		);

		const reply = (await described) as { id: number; chains: Array<Array<Record<string, unknown>>> };
		expect(reply.id).toBe(9);
		expect(reply.chains).toHaveLength(2);
		expect(reply.chains[0]?.map((hit) => hit.selector)).toEqual([
			"main",
			"main > ul",
			"main > ul > li:nth-of-type(2)",
		]);
		// a selector nothing answers is an empty chain, never a guess
		expect(reply.chains[1]).toEqual([]);
	});

	it("leaves the frame's own timers and frames alone", async () => {
		// The shim used to wrap rAF and setInterval to hold a frozen frame still.
		// The engine does that now, without the frame's cooperation and without a
		// cross-origin condition (#84), so wrapping them would only be a second
		// mechanism to keep in step with the first.
		const shim = await servedShim();
		const nativeRaf = window.requestAnimationFrame;
		const nativeInterval = window.setInterval;
		runShim(shim);

		expect(window.requestAnimationFrame).toBe(nativeRaf);
		expect(window.setInterval).toBe(nativeInterval);
	});
});
