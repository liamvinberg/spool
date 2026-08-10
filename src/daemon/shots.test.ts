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
 * own. What lands is the same one-image cover shape the frame writes itself.
 */

const frameTsx = `export default function Frame() {
	return <main style={{ background: "#f5391a", width: "100%", height: "100vh" }}>shot me</main>;
}
`;

function jpegSize(bytes: Uint8Array): [number, number] | undefined {
	for (let index = 2; index + 8 < bytes.length; ) {
		if (bytes[index] !== 0xff) return undefined;
		const marker = bytes[index + 1];
		const length = (bytes[index + 2] ?? 0) * 256 + (bytes[index + 3] ?? 0);
		if (marker !== undefined && marker >= 0xc0 && marker <= 0xc3) {
			return [
				(bytes[index + 7] ?? 0) * 256 + (bytes[index + 8] ?? 0),
				(bytes[index + 5] ?? 0) * 256 + (bytes[index + 6] ?? 0),
			];
		}
		index += 2 + length;
	}
	return undefined;
}

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

		const coverOf = async (): Promise<{ hash: string } | undefined> => {
			const res = await fetch(`${daemon.url}/api/p/${name}/frames`, control);
			const { frames } = (await res.json()) as {
				frames: { name: string; cover?: { hash: string } }[];
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

		await expect.poll(coverOf, { timeout: 45_000, interval: 500 }).toMatchObject({ hash: expect.any(String) });
		const cover = await coverOf();
		const image = await fetch(`${daemon.url}/covers/${name}/cover-me/${cover?.hash}`);
		// a healed cover is bounded and lossy, like the canvas's own (#8)
		expect(image.headers.get("content-type")).toBe("image/jpeg");
		expect(image.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
		expect(jpegSize(new Uint8Array(await image.arrayBuffer()))).toEqual([800, 500]);
	});
});
