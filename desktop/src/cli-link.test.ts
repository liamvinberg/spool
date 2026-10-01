import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { launcherPath, linkDirectly, linkState, otherSpool } from "./cli-link";

const LAUNCHER = join(__dirname, "../bin/spool");

function directory(): string {
	return mkdtempSync(join(tmpdir(), "spool-cli-link-"));
}

test("a link to this app's launcher is current, to another app's is stale, anything else is not the app's", () => {
	const root = directory();
	const launcher = launcherPath("/Applications/Spool.app/Contents/Resources");
	const link = join(root, "spool");
	assert.equal(linkState(launcher, link), "absent");
	symlinkSync(launcher, link);
	assert.equal(linkState(launcher, link), "current");
	assert.equal(linkState(launcherPath("/Users/me/Applications/Spool.app/Contents/Resources"), link), "stale");
	const npm = join(root, "npm-spool");
	symlinkSync("../lib/node_modules/spool.page/dist/cli.js", npm);
	assert.equal(linkState(launcher, npm), "foreign");
	const file = join(root, "file");
	writeFileSync(file, "");
	assert.equal(linkState(launcher, file), "foreign");
});

test("links directly where the directory is writable, replacing a stale link", () => {
	const root = directory();
	const link = join(root, "spool");
	symlinkSync("/Volumes/Spool/Spool.app/Contents/Resources/bin/spool", link);
	assert.equal(linkDirectly("/Applications/Spool.app/Contents/Resources/bin/spool", link), true);
	assert.equal(readlinkSync(link), "/Applications/Spool.app/Contents/Resources/bin/spool");
	assert.equal(linkDirectly("/x", join(root, "missing", "spool")), false);
});

test("finds a spool installed some other way, and not the link itself", () => {
	const root = directory();
	const link = join(root, "local", "spool");
	mkdirSync(join(root, "local"));
	mkdirSync(join(root, "pnpm"));
	writeFileSync(link, "");
	chmodSync(link, 0o755);
	assert.equal(otherSpool(join(root, "local"), link), undefined);
	const installed = join(root, "pnpm", "spool");
	writeFileSync(installed, "");
	chmodSync(installed, 0o755);
	assert.equal(otherSpool(["", join(root, "local"), join(root, "pnpm")].join(":"), link), installed);
});

test("the launcher runs the bundled cli under the app's binary, through a link", () => {
	const contents = join(directory(), "Spool.app", "Contents");
	const resources = join(contents, "Resources");
	mkdirSync(join(contents, "MacOS"), { recursive: true });
	mkdirSync(join(resources, "bin"), { recursive: true });
	copyFileSync(LAUNCHER, join(resources, "bin", "spool"));
	chmodSync(join(resources, "bin", "spool"), 0o755);
	writeFileSync(join(contents, "MacOS", "Spool"), '#!/bin/sh\nprintf "%s\\n" "$ELECTRON_RUN_AS_NODE" "$@"\n');
	chmodSync(join(contents, "MacOS", "Spool"), 0o755);
	const link = join(directory(), "spool");
	symlinkSync(join(resources, "bin", "spool"), link);
	const run = spawnSync(link, ["serve", "a b"], { encoding: "utf8" });
	assert.equal(run.status, 0, run.stderr);
	const real = spawnSync("/bin/sh", ["-c", 'cd "$1" && pwd -P', "-", resources], { encoding: "utf8" }).stdout.trim();
	assert.deepEqual(run.stdout.trimEnd().split("\n"), [
		"1",
		"-r",
		`${real}/shim/electron-argv.js`,
		`${real}/cli/spool/node_modules/spool.page/dist/cli.js`,
		"serve",
		"a b",
	]);
});
