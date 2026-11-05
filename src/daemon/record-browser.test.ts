import { readFileSync } from "node:fs";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { chromium } from "playwright-core";
import { expect, it } from "vitest";
import { headlessShellArgs } from "../headless-shell";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * Record (spool#221) from the canvas's menu to the downloaded clip, against a
 * really-served daemon and the pinned headless shell. On a machine without the
 * shell the browser half returns early rather than fetching ninety megabytes.
 */

async function shellAvailable(): Promise<boolean> {
	try {
		const browser = await chromium.launch({
			channel: "chromium-headless-shell",
			headless: true,
			args: headlessShellArgs(),
		});
		await browser.close();
		return true;
	} catch {
		return false;
	}
}

/** A button that sounds only when it is clicked, so the clip's sound is proof the click was played back. */
const BEEPER = `export default function Frame() {
	return (
		<main style={{ background: "#f4f2ee", width: "100%", height: "100vh", display: "grid", placeItems: "center" }}>
			<button
				style={{ width: 160, height: 60 }}
				onClick={(event) => {
					const audio = new AudioContext();
					const tone = audio.createOscillator();
					tone.connect(audio.destination);
					tone.start(audio.currentTime);
					tone.stop(audio.currentTime + 0.2);
					event.currentTarget.textContent = "clicked";
				}}
			>
				press
			</button>
		</main>
	);
}
`;

const record = (project: { url: string; name: string; controlToken: string }, body: object) =>
	fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/record`, {
		method: "POST",
		headers: { "X-Spool-Control": project.controlToken, "content-type": "application/json" },
		body: JSON.stringify(body),
	});

it("records from the canvas's Record: the player opens recording, notes the hands, and downloads the clip", async () => {
	if (!(await shellAvailable())) return;
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir, experiments: { record: true } });
	writeFrame(project.root, "beeper", BEEPER);
	writeDesignFile(project.root, "frames/beeper/frame.json", JSON.stringify({ x: 0, y: 0, w: 400, h: 300 }));
	const browser = await testBrowser();
	const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
	const canvas = await context.newPage();
	await canvas.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	await canvas.locator('[data-frame-label="beeper"]').click({ button: "right" });
	const opened = context.waitForEvent("page");
	await canvas.getByRole("menuitem", { name: "Record" }).click();
	const played = await opened;
	const stop = played.getByRole("button", { name: "Stop recording" });
	await stop.waitFor({ timeout: 30_000 });

	const inner = played.frameLocator("iframe");
	await inner.getByRole("button", { name: "press" }).click();
	await expect.poll(() => inner.getByRole("button", { name: "clicked" }).count()).toBe(1);
	// Escape, pressed in the frame, is the stop rather than a key in the clip
	await played.keyboard.press("Escape");
	await played.getByRole("button", { name: "1:1" }).click();
	const download = await played.waitForEvent("download", { timeout: 60_000 });
	expect(download.suggestedFilename()).toBe("beeper.mp4");
	const path = await download.path();
	const clip = new Input({ source: new BufferSource(readFileSync(path)), formats: ALL_FORMATS });
	expect((await clip.getPrimaryVideoTrack())?.displayWidth).toBe(1080);
	// the click was noted and played back: the clip has the sound it made
	expect((await clip.getPrimaryAudioTrack())?.codec).toBe("aac");
	await expect.poll(() => played.getByRole("status").textContent()).toBe("saved");
}, 180_000);

it("refuses a recording while the experiment is off", async () => {
	const project = await serveProject();
	writeFrame(project.root, "beeper", BEEPER);
	const res = await record(project, { frame: "beeper", duration: 1000, aspect: "16:9", inputs: [] });
	expect(res.status).toBe(403);
	expect(await res.text()).toContain("spool experiments on record");
});
