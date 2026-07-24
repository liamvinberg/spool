#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { watchesCheckoutUi, watchUiBuild } from "./dev-ui";
import { registerCheckoutUiWatcher } from "./dev-ui-hook";

if (watchesCheckoutUi(process.argv.slice(2))) {
	registerCheckoutUiWatcher(() =>
		watchUiBuild({ configFile: fileURLToPath(new URL("../vite.config.ts", import.meta.url)) }),
	);
}

await import("./cli");
