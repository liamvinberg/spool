import { expect, it } from "vitest";
import { testBrowser } from "../test-browser";
import { AUDIO_KEY, AUDIO_SOURCE } from "./record";

/**
 * A recording's sound (spool#221) is rendered offline once the recording is
 * played, so everything a frame means by "now" has to land when it was said.
 * Played the way interaction-sound libraries play (cuelume among them): a node
 * started with no time, a value set rather than scheduled, a disconnect.
 */
it("lands a sound played 'now' at the moment it was played, and no longer than it was told to", async () => {
	const browser = await testBrowser();
	const page = await browser.newPage();
	await page.addInitScript(AUDIO_SOURCE);
	await page.goto("about:blank");
	const { left, on, off } = await page.evaluate(async (key) => {
		const from = performance.now();
		const audio = new AudioContext();
		await new Promise((done) => setTimeout(done, 400));
		const tone = audio.createOscillator();
		const level = audio.createGain();
		level.gain.value = 0.5;
		tone.connect(level).connect(audio.destination);
		tone.start();
		const on = performance.now() - from;
		await new Promise((done) => setTimeout(done, 200));
		level.disconnect();
		const off = performance.now() - from;
		const sound = await (
			window as unknown as Record<string, { finish(from: number, ms: number): Promise<{ left: string }> }>
		)[key]?.finish(from, 1500);
		const bytes = Uint8Array.from(atob(sound?.left ?? ""), (c) => c.charCodeAt(0));
		return { left: Array.from(new Float32Array(bytes.buffer)), on, off };
	}, AUDIO_KEY);
	const peak = (from: number, to: number) => Math.max(...left.slice(from * 48, to * 48).map(Math.abs));
	expect(peak(0, on - 10)).toBeLessThan(0.01);
	expect(peak(on + 10, off - 10)).toBeGreaterThan(0.45);
	expect(peak(off + 10, 1500)).toBeLessThan(0.01);
});
