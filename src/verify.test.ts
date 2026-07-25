import { existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { describe, expect, it } from "vitest";
import { readDaemonState } from "./daemon/lifecycle";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "./test-helpers";
import { type BootDeps, logsFrame, shotFrame } from "./verify";

/**
 * shot/logs against a really-served daemon. The compile paths never need a
 * browser — they always run. The one boot smoke (#18: the shot path is
 * deliberately unseamed beyond this) is gated on a playwright-managed build
 * already being on the machine: tests never trigger the ~90 MB lazy fetch,
 * that narration is #27's second-machine acceptance.
 */

async function browserAvailable(): Promise<boolean> {
	try {
		const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
		await browser.close();
		return true;
	} catch {
		return false;
	}
}

async function serveVerifyProject() {
	const { spoolDir, root, name, url } = await serveProject();
	const controlToken = readDaemonState(spoolDir)?.controlToken;
	if (controlToken === undefined) throw new Error("test daemon has no control token");
	const deps = (frame: string): BootDeps => ({
		daemonUrl: url,
		controlToken,
		root,
		name,
		frame,
		narrate: () => {},
	});
	return { root, deps };
}

describe("shot and logs, compile paths", () => {
	it("hands a broken frame's compile error verbatim, without a browser", async () => {
		const { root, deps } = await serveVerifyProject();
		writeFrame(root, "broken", "export default function Broken() { return <main>unclosed;\n}\n");

		const shot = await shotFrame(deps("broken"));
		const logs = await logsFrame(deps("broken"));

		expect(shot.kind).toBe("broken");
		expect(logs.kind).toBe("broken");
		// esbuild's own text, untouched — the agent reads the real diagnosis
		expect((shot as { message: string }).message).toContain("Unexpected end of file");
	});

	it("refuses a frame that does not exist", async () => {
		const { deps } = await serveVerifyProject();

		const shot = await shotFrame(deps("ghost"));

		expect(shot.kind).toBe("missing");
		expect((shot as { message: string }).message).toContain("ghost");
	});

	it("does not write a terminal shot through an escaped verify directory", async () => {
		const { root, deps } = await serveVerifyProject();
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// inert terminal\n");
		writeDesignFile(
			root,
			join(".spool", "term", "dash.screen"),
			`${JSON.stringify({ cols: 80, rows: 24, screen: "persisted screen" })}\n`,
		);
		const outside = makeTempDir();
		mkdirSync(join(root, "design", ".spool"), { recursive: true });
		symlinkSync(outside, join(root, "design", ".spool", "verify"), "dir");

		await expect(shotFrame(deps("dash"))).rejects.toThrow(
			'design boundary: ".spool/verify/dash.svg" resolves outside design/',
		);
		expect(readdirSync(outside)).toEqual([]);
	});

	it("does not read an html log cache through an escaped verify directory", async () => {
		const { root, deps } = await serveVerifyProject();
		writeFrame(root, "quiet", "export default function Quiet() { return <main>quiet</main> }\n");
		const outside = makeTempDir();
		mkdirSync(join(root, "design", ".spool"), { recursive: true });
		symlinkSync(outside, join(root, "design", ".spool", "verify"), "dir");

		await expect(logsFrame(deps("quiet"))).rejects.toThrow(
			'design boundary: ".spool/verify/quiet.logs.json" resolves outside design/',
		);
		expect(readdirSync(outside)).toEqual([]);
	});

	it("does not reclassify a terminal when its persisted-screen read escapes design", async () => {
		const { root, deps } = await serveVerifyProject();
		writeDesignFile(root, join("frames", "dash", "term.tsx"), "// inert terminal\n");
		const termDir = join(root, "design", ".spool", "term");
		mkdirSync(termDir, { recursive: true });
		const outside = join(makeTempDir(), "dash.screen");
		writeFileSync(outside, JSON.stringify({ cols: 80, rows: 24, screen: "outside" }));
		symlinkSync(outside, join(termDir, "dash.screen"));

		await expect(shotFrame(deps("dash"))).rejects.toThrow(
			'design boundary: ".spool/term/dash.screen" resolves outside design/',
		);
	});
});

describe("the one boot smoke", () => {
	it("boots, shoots, logs, replays, refreshes on edit, surfaces boot errors", { timeout: 180_000 }, async () => {
		if (!(await browserAvailable())) return; // no build on this machine: #27 covers the fetch path

		const { root, deps } = await serveVerifyProject();
		writeFrame(
			root,
			"noisy",
			`console.log("hello from boot");

export default function Noisy() {
	return <main>noisy</main>;
}
`,
		);

		const shot = await shotFrame(deps("noisy"));
		expect(shot.kind).toBe("shot");
		const file = (shot as { file: string }).file;
		expect(file).toBe(join(root, "design", ".spool", "verify", "noisy.png"));
		expect(existsSync(file)).toBe(true);
		expect((shot as { bootErrors: string[] }).bootErrors).toEqual([]);

		// logs replay the shot's boot — same source, no second boot
		const replay = await logsFrame(deps("noisy"));
		expect(replay).toMatchObject({ kind: "logs", replayed: true });
		expect((replay as { entries: { type: string; text: string }[] }).entries).toContainEqual({
			type: "log",
			text: "hello from boot",
		});

		// an edit stales the cache: logs boot fresh
		writeFrame(
			root,
			"noisy",
			`console.log("edited boot");

export default function Noisy() {
	return <main>noisy</main>;
}
`,
		);
		const fresh = await logsFrame(deps("noisy"));
		expect(fresh).toMatchObject({ kind: "logs", replayed: false });
		expect((fresh as { entries: { type: string; text: string }[] }).entries).toContainEqual({
			type: "log",
			text: "edited boot",
		});

		// a frame that throws on boot: the shot lands, the errors mark it broken
		writeFrame(
			root,
			"thrower",
			`export default function Thrower() {
	throw new Error("boom at boot");
}
`,
		);
		const thrown = await shotFrame(deps("thrower"));
		expect(thrown.kind).toBe("shot");
		const errors = (thrown as { bootErrors: string[] }).bootErrors;
		expect(errors.length).toBeGreaterThan(0);
		expect(errors.join("\n")).toContain("boom at boot");
	});
});
