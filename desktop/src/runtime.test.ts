import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cloudCommand } from "./runtime";

test("the native account action runs the bundled CLI in the same local instance", (t) => {
	const resources = mkdtempSync(join(tmpdir(), "spool-runtime-"));
	t.after(() => rmSync(resources, { recursive: true, force: true }));
	const cli = join(resources, "cli", "spool", "node_modules", "spool.page", "dist", "cli.js");
	mkdirSync(join(cli, ".."), { recursive: true });
	writeFileSync(cli, "");
	const spec = cloudCommand("/Applications/Spool.app/Electron", resources, "/tmp/spool-lane", "login", {
		SPOOL_CLOUD_ORIGIN: "https://beta.spool.page",
	});
	assert.deepEqual(spec, {
		command: "/Applications/Spool.app/Electron",
		args: ["-r", join(resources, "shim", "electron-argv.js"), cli, "login"],
		env: {
			ELECTRON_RUN_AS_NODE: "1",
			SPOOL_DIR: "/tmp/spool-lane",
			SPOOL_CLOUD_ORIGIN: "https://beta.spool.page",
		},
	});
});
