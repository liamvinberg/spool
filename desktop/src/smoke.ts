import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import { status } from "./daemon";
import { buildAppMenu, buildTrayMenu, trayImage } from "./main";
import { beginUpdateRestart } from "./update-restart";

// The check CI runs on macOS, and the only one that needs a real Electron.
//
// It proves three things a unit test cannot: the main process module loads under
// Electron at all, the menus this app builds are ones Electron accepts (a bad
// role or accelerator throws here rather than on somebody's Dock), and the
// daemon probe answers "nothing running" for a state directory that has never
// held a daemon. Everything else about the app is behavior around those.

async function run(): Promise<void> {
	const directory = mkdtempSync(join(tmpdir(), "spool-desktop-smoke-"));
	try {
		const empty = await status(directory);
		if (empty.running) throw new Error(`an empty state directory reported a running daemon`);

		const image = trayImage();
		if (image.isEmpty()) throw new Error("the tray mark is missing from the bundle");

		if (buildAppMenu().items.length === 0) throw new Error("the application menu is empty");
		if (buildTrayMenu().items.length === 0) throw new Error("the tray menu is empty");

		// Launch the actual entry point while an older app must stay out of ShipIt's
		// way. No fake app events: a real second Electron process must exit without
		// opening the canvas, spawning the daemon, or consuming the handoff.
		beginUpdateRestart(directory, "999.0.0");
		await new Promise<void>((resolve, reject) => {
			const child = spawn(process.execPath, [join(__dirname, "index.js")], {
				env: { ...process.env, SPOOL_DIR: directory },
				stdio: "ignore",
			});
			const deadline = setTimeout(() => {
				child.kill();
				reject(new Error("old app did not exit during update handoff"));
			}, 10_000);
			child.once("error", (error) => {
				clearTimeout(deadline);
				reject(error);
			});
			child.once("exit", (code) => {
				clearTimeout(deadline);
				if (code === 0) resolve();
				else reject(new Error(`handoff launch exited ${code}`));
			});
		});
		const lines = readFileSync(join(directory, "app.log"), "utf8");
		assert.match(lines, /waiting for native replacement/);
		assert.doesNotMatch(lines, /\tboot\t|\tdaemon\t/);
		assert.equal(existsSync(join(directory, "daemon.json")), false);
		assert.equal(existsSync(join(directory, "app-update-restart.json")), true);

		process.stdout.write(`smoke ok — electron ${process.versions.electron}\n`);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

void app.whenReady().then(async () => {
	try {
		await run();
		app.exit(0);
	} catch (error) {
		process.stderr.write(`smoke failed: ${(error as Error).message}\n`);
		app.exit(1);
	}
});
