import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "electron";
import { status } from "./daemon";
import { buildAppMenu, buildTrayMenu, trayImage } from "./main";

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
