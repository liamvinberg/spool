import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { serveBundledHost } from "./bundled-host-server";
import { BundledRuntime } from "./bundled-runtime";

// pi-ai imports each provider's sign-in flow through a path a bundle cannot
// follow, so the host hands it every flow up front.
registerBunOAuthFlows();

const directory = process.env.SPOOL_BUNDLED_STATE;
if (directory === undefined) throw new Error("Bundled host requires instance state");
void BundledRuntime.create(directory)
	.then(serveBundledHost)
	.catch(() => process.exit(1));
