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

describe("the freeze shim", () => {
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
