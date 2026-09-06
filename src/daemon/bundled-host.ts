import { serveBundledHost } from "./bundled-host-server";
import { BundledRuntime } from "./bundled-runtime";

const directory = process.env.SPOOL_BUNDLED_STATE;
if (directory === undefined) throw new Error("Bundled host requires instance state");
void BundledRuntime.create(directory)
	.then(serveBundledHost)
	.catch(() => process.exit(1));
