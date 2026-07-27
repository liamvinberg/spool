import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeProject, makeTempDir, sseReader, writeFrame } from "../test-helpers";
import { serveDaemon } from "./server";
import { createShotTaker } from "./shots";

/**
 * The one Playwright smoke (#18 testing decisions: the shot path is
 * deliberately unseamed). Tolerant: on a machine without a playwright-managed
 * browser the test observes the quiet no-op instead of a shot.
 *
 * A frames read is where a canvas learns a frame has no cover, so it is also
 * where the heal is asked for (#111) — a frame with none asks for nothing on its
 * own. What lands is a one-rung ladder at the bottom rung: the daemon has no
 * image library to make the rungs above it.
 */

const frameTsx = `export default function Frame() {
	return <main style={{ background: "#f5391a", width: "100%", height: "100vh" }}>shot me</main>;
}
`;

describe("the thumbnail fallback", () => {
	it("heals a missing cover through a headless shot, or no-ops without a browser", {
		timeout: 60_000,
	}, async () => {
		const probe = createShotTaker();
		const browserless =
			(await probe.capture({ url: "data:text/html,<div id=root><p>x</p></div>", width: 10, height: 10 })) ===
			undefined;
		await probe.close();

		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "cover-me", frameTsx);
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
		const control = { headers: { "X-Spool-Control": daemon.controlToken } };
		const controller = new AbortController();
		onTestFinished(() => controller.abort()); // LIFO: the stream lets go before the server closes

		const events = await fetch(`${daemon.url}/api/p/${name}/events`, {
			...control,
			signal: controller.signal,
		});
		const reader = sseReader(events);
		expect((await reader.next()).event).toBe("hello");

		const coverOf = async (): Promise<{ hash: string; widths: number[] } | undefined> => {
			const res = await fetch(`${daemon.url}/api/p/${name}/frames`, control);
			const { frames } = (await res.json()) as {
				frames: { name: string; cover?: { hash: string; widths: number[] } }[];
			};
			return frames.find((frame) => frame.name === "cover-me")?.cover;
		};

		// the read that finds no cover is the read that asks for one
		expect(await coverOf()).toBeUndefined();

		if (browserless) {
			// no playwright-managed build on this machine (#25 fetches it): the
			// healer must stay quiet — no crash, no cover, no event
			await reader.expectQuiet(2000);
			expect(await coverOf()).toBeUndefined();
			return;
		}

		// one rung, at the bottom of the ladder a self-capture would write: a
		// 390×844 frame's top rung is 780 wide, so a heal writes 195
		await expect.poll(async () => (await coverOf())?.widths, { timeout: 45_000, interval: 500 }).toEqual([195]);
		const cover = await coverOf();
		const rung = await fetch(`${daemon.url}/covers/${name}/cover-me/${cover?.hash}/195`);
		// a healed cover is bounded and lossy, like the canvas's own (#8)
		expect(rung.headers.get("content-type")).toBe("image/jpeg");
		expect(rung.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
		expect((await rung.arrayBuffer()).byteLength).toBeGreaterThan(100);
	});
});
