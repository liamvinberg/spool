// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { ProjectCanvas } from "./canvas";

const frames = [{ name: "home", kind: "html", x: 0, y: 0, w: 100, h: 100 }];

describe("canvas boot", () => {
	it("opens while the flow resolve is still running, and takes its arrows when it lands", async () => {
		const requested: string[] = [];
		let flowReads = 0;
		let release = () => {};
		const resolving = new Promise<void>((done) => {
			release = done;
		});
		stubFetch(async (url) => {
			requested.push(url.pathname);
			if (url.pathname.endsWith("/flows/resolve")) {
				await resolving;
				return Response.json({ read: 1 });
			}
			if (url.pathname.endsWith("/flows")) {
				flowReads += 1;
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
			}
			return undefined;
		});
		const host = mountCanvas();
		onTestFinished(release);
		await until(() => requested.some((path) => path.endsWith("/flows/resolve")));

		// the frame is on screen with the resolve still out, and the graph the
		// canvas opened on is the one read it did not wait for
		expect(host.querySelector('[data-frame-label="home"]')).not.toBeNull();
		expect(flowReads).toBe(1);

		release();
		await until(() => flowReads === 2);
	});

	it("mounts the first document as soon as it has a camera and frames", async () => {
		stubFetch(async () => undefined);
		const host = mountCanvas();

		// no clock is advanced here: the settle and the sweep are both still
		// pending, and the document is expected without either of them
		await flush();

		expect(host.querySelector('[data-frame-label="home"]')).not.toBeNull();
		expect(host.querySelector('iframe[title="home"]')).not.toBeNull();
	});

	it("keeps the pages rail standing over an empty project", async () => {
		stubEmptyProject();
		const host = mountCanvas();
		await flush();

		// the surface says there is nothing on it
		expect(host.querySelector("[data-canvas-empty]")).not.toBeNull();
		// the pages tree stands over a project with nothing in it, and draws no row:
		// the root page has none of its own, and there is nothing on it yet
		expect(host.querySelector('[aria-label="Pages tree"]')).not.toBeNull();
		expect(host.querySelector('[aria-label="Pages tree"] [role="treeitem"]')).toBeNull();
		expect(host.querySelector("[data-frame-label]")).toBeNull();
		// nothing to arrange yet
		expect(host.querySelector('[aria-label="canvas tools"]')).toBeNull();
	});

	it("leaves no agent rail behind unless the machine switched it on (#238)", async () => {
		stubEmptyProject();
		const host = mountCanvas();
		await flush();

		// off is absent rather than hidden: no rail, and no strip to expand one from
		expect(host.querySelector("[data-agent-rail]")).toBeNull();
		expect(host.querySelector('[aria-label="Expand agent"]')).toBeNull();
		expect(host.querySelector('[aria-label="Agent"]')).toBeNull();
	});

	it("stands the agent rail where the experiment names it (#238)", async () => {
		switchOn("agent-panel");
		stubEmptyProject();
		const host = mountCanvas();
		await flush();

		expect(host.querySelector("[data-agent-rail]")).not.toBeNull();
	});
});

/** A project with nothing in it, which is what both rail states are read over. */
function stubEmptyProject(): void {
	stubFetch(async (url) => {
		if (url.pathname.endsWith("/frames")) {
			return Response.json({ root: "/project", pages: [], frames: [], collisions: [] });
		}
		if (url.pathname.endsWith("/flows")) {
			return Response.json({ frames: [], links: [], edges: [], unreadable: [] });
		}
		return undefined;
	});
}

/** The experiments this machine's config named, as the boot script would have left them. */
function switchOn(...names: string[]): void {
	Object.assign(window, { __SPOOL_EXPERIMENTS__: names });
	onTestFinished(() => {
		delete window.__SPOOL_EXPERIMENTS__;
	});
}

/** The canvas's own reads; anything a test does not answer for itself. */
function stubFetch(answer: (url: URL) => Promise<Response | undefined>): void {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
			const own = await answer(url);
			if (own !== undefined) return own;
			if (url.pathname.endsWith("/state")) return Response.json({ camera: { x: 0, y: 0, k: 1 } });
			if (url.pathname.endsWith("/frames")) {
				return Response.json({ root: "/project", pages: [], frames, collisions: [] });
			}
			if (url.pathname.endsWith("/flows")) {
				return Response.json({ frames: ["home"], links: [], edges: [], unreadable: [] });
			}
			return Response.json({});
		}),
	);
}

function mountCanvas(): HTMLElement {
	vi.stubGlobal(
		"EventSource",
		class {
			addEventListener() {}
			close() {}
		},
	);
	vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
		callback(performance.now() + 1000);
		return 1;
	});
	vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});
	act(() => {
		root.render(createElement(ProjectCanvas, { project: "test", onChrome: () => {} }));
	});
	return host;
}

/** Let every pending answer land, without letting any timer fire. */
async function flush(): Promise<void> {
	for (let turn = 0; turn < 20; turn++) await act(async () => {});
}

async function until(done: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (done()) return;
		await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
	}
	expect(done()).toBe(true);
}
