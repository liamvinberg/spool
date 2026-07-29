#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mirrorCaptures } from "./dev-captures";
import { watchesCheckoutUi, watchUiBuild } from "./dev-ui";
import { registerCheckoutUiWatcher } from "./dev-ui-hook";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// the dogfood split lives here so every checkout entry — pnpm dev, a shim on
// PATH — is isolated from the installed spool by default; explicit env wins
process.env.SPOOL_DIR ??= join(homedir(), ".spool-dev");
process.env.SPOOL_PORT ??= "7767";

// the canvas plays the captures out of its own fixtures, and they are tracked
// outside it, so every checkout entry refreshes the mirror before serving
mirrorCaptures(join(repoRoot, "fixtures", "captures"), join(repoRoot, "design", "shared", "fixtures", "captures"));

if (process.argv[2] === "skill") {
	process.stdout.write(
		`You are on the checkout CLI — its own instance (state ${process.env.SPOOL_DIR}, port ${process.env.SPOOL_PORT}), not the installed spool. Run every verb exactly as you invoked skill: same command, different verb; a bare \`spool\` is a different instance on a different version.\n\n`,
	);
}

if (watchesCheckoutUi(process.argv.slice(2))) {
	registerCheckoutUiWatcher(() => watchUiBuild({ configFile: join(repoRoot, "vite.config.ts") }));
}

await import("./cli");
