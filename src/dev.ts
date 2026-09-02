#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { configuredPort, readDaemonState, resolveSpoolDir } from "./daemon/lifecycle";
import { appArgs, electronInstalled, openCheckoutApp, opensCheckoutApp } from "./dev-app";
import { mirrorCaptures } from "./dev-captures";
import { watchesCheckoutUi, watchUiBuild } from "./dev-ui";
import { registerCheckoutUiWatcher } from "./dev-ui-hook";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// the dogfood split lives here so every checkout entry — pnpm dev, a shim on
// PATH — is isolated from the installed spool by default; explicit env wins
process.env.SPOOL_DIR ??= join(homedir(), ".spool-dev");
// 7767 is the checkout's port everywhere it has not been said otherwise, but it
// is a default and not a decree: SPOOL_PORT is how a caller overrides
// config.json, so setting it here would have this file quietly outrank the one
// place a machine gets to say where its own daemon lives. One machine that
// cares: a daemon reached over a forwarded port has to bind the port the
// browser names, or every write arrives with an Origin it refuses.
if (process.env.SPOOL_PORT === undefined && configuredPort(resolveSpoolDir(process.env)) === undefined) {
	process.env.SPOOL_PORT = "7767";
}

// the canvas plays the captures out of its own fixtures, and they are tracked
// outside it, so every checkout entry refreshes the mirror before serving
mirrorCaptures(join(repoRoot, "fixtures", "captures"), join(repoRoot, "design", "shared", "fixtures", "captures"));

if (process.argv[2] === "skill") {
	process.stdout.write(
		`You are on the checkout CLI — its own instance (state ${process.env.SPOOL_DIR}, port ${process.env.SPOOL_PORT}), not the installed spool. Run every verb exactly as you invoked skill: same command, different verb; a bare \`spool\` is a different instance on a different version.\n\n`,
	);
}

// `app` is `serve --foreground` with the checkout's Mac app opened on it once
// the daemon answers, so the verb the CLI sees is the one the UI watcher arms on
const desktopDir = join(repoRoot, "desktop");
const app = opensCheckoutApp(process.argv.slice(2));
if (app) {
	if (!electronInstalled(desktopDir)) {
		process.stderr.write("spool dev app: the Mac app is not installed — run `pnpm --dir desktop install` first\n");
		process.exit(1);
	}
	process.argv.splice(2, process.argv.length, ...appArgs(process.argv.slice(2)));
}

if (watchesCheckoutUi(process.argv.slice(2))) {
	registerCheckoutUiWatcher(() => watchUiBuild({ configFile: join(repoRoot, "vite.config.ts") }));
}

await import("./cli");

// the CLI has returned: listening, stood down for a sibling, or refused with an
// exit code — only the first two leave a daemon to open the window on
if (app && process.exitCode === undefined) {
	const spoolDir = resolveSpoolDir(process.env);
	const window = await openCheckoutApp({ desktopDir, spoolDir });
	const stopWindow = () => window.kill("SIGTERM");
	process.once("SIGINT", stopWindow);
	process.once("SIGTERM", stopWindow);
	window.once("exit", () => {
		// quitting the app ends the session: a daemon this process is serving goes
		// with it, and an adopted sibling is left the way the app leaves one
		if (readDaemonState(spoolDir)?.pid === process.pid) process.kill(process.pid, "SIGTERM");
	});
}
