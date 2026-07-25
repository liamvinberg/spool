import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeProject, makeTempDir, sseReader, writeFrame } from "../test-helpers";
import { serveDaemon } from "./server";
import { createShotTaker } from "./shots";

/**
 * The one Playwright smoke (#18 testing decisions: the shot path is
 * deliberately unseamed). Tolerant: on a machine without a playwright-managed
 * browser the test observes the quiet no-op instead of a shot.
 */

const frameTsx = `export default function Frame() {
	return <main style={{ background: "#f5391a", width: "100%", height: "100vh" }}>shot me</main>;
}
`;

describe("the thumbnail fallback", () => {
	it("heals a missing thumbnail through a headless shot, or no-ops without a browser", {
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

		const miss = await fetch(`${daemon.url}/api/p/${name}/thumbs/cover-me`, control);
		expect(miss.status).toBe(404);

		if (browserless) {
			// no playwright-managed build on this machine (#25 fetches it): the
			// healer must stay quiet — no crash, no thumb, no event
			await reader.expectQuiet(2000);
			expect((await fetch(`${daemon.url}/api/p/${name}/thumbs/cover-me`, control)).status).toBe(404);
			return;
		}

		await expect
			.poll(async () => (await fetch(`${daemon.url}/api/p/${name}/thumbs/cover-me`, control)).status, {
				timeout: 45_000,
				interval: 500,
			})
			.toBe(200);
		const thumb = await fetch(`${daemon.url}/api/p/${name}/thumbs/cover-me`, control);
		expect(thumb.headers.get("content-type")).toBe("image/png");
		expect((await thumb.arrayBuffer()).byteLength).toBeGreaterThan(1000);
	});
});
