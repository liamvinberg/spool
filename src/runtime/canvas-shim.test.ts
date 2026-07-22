// @vitest-environment happy-dom

import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeApp, makeProject, makeTempDir, writeFrame } from "../test-helpers";

/**
 * The canvas shim rides every served frame document as a classic script so it
 * wraps timers before any module evaluates (#8: warm = real DOM with time
 * stopped inside). Here the served shim is extracted from a real document and
 * run in the happy-dom realm — freeze semantics are behavior, not text.
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

function runShim(shim: string): void {
	// a classic script in the document realm: window-bound, module-free
	new Function(shim)();
}

/** The next {spool:"picked"} reply — parent === window here, so it echoes back. */
function nextPicked(): Promise<unknown> {
	return new Promise((resolve) => {
		const onMessage = (event: MessageEvent) => {
			const data = event.data as { spool?: string } | null;
			if (data === null || typeof data !== "object" || data.spool !== "picked") return;
			window.removeEventListener("message", onMessage);
			resolve(data);
		};
		window.addEventListener("message", onMessage);
	});
}

describe("the freeze shim", () => {
	it("claims canvas zoom gestures that start inside an entered frame", async () => {
		const shim = await servedShim();
		const posted: unknown[] = [];
		const parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent");
		Object.defineProperty(window, "parent", {
			configurable: true,
			value: { postMessage: (message: unknown) => posted.push(message) },
		});
		window.__SPOOL__ = { project: "project", frame: "host" };

		try {
			runShim(shim);

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
			delete window.__SPOOL__;
			if (parentDescriptor !== undefined) Object.defineProperty(window, "parent", parentDescriptor);
		}
	});

	it("holds rAF callbacks while frozen and releases them on thaw", async () => {
		const shim = await servedShim();
		runShim(shim);

		const ran: string[] = [];
		window.postMessage({ spool: "freeze", on: true }, "*");
		await vi.waitFor(() => {
			// the message listener is async; freezing is observable once rAF stops scheduling
			window.requestAnimationFrame(() => ran.push("frozen"));
			expect(ran).toEqual([]);
		});

		window.postMessage({ spool: "freeze", on: false }, "*");
		await vi.waitFor(() => expect(ran).toContain("frozen"));
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

	it("skips setInterval ticks while frozen", async () => {
		const shim = await servedShim();
		runShim(shim);

		let ticks = 0;
		const interval = window.setInterval(() => {
			ticks++;
		}, 5);
		await vi.waitFor(() => expect(ticks).toBeGreaterThan(0));

		window.postMessage({ spool: "freeze", on: true }, "*");
		await new Promise((resolve) => setTimeout(resolve, 30));
		const frozenAt = ticks;
		await new Promise((resolve) => setTimeout(resolve, 40));
		expect(ticks).toBe(frozenAt);

		window.postMessage({ spool: "freeze", on: false }, "*");
		await vi.waitFor(() => expect(ticks).toBeGreaterThan(frozenAt));
		window.clearInterval(interval);
	});
});
