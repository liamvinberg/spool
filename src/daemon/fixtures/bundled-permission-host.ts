import { existsSync } from "node:fs";
import { join } from "node:path";
import { serveBundledHost } from "../bundled-host-server";
import { deterministicBundledRuntime } from "./bundled-provider";

const directory = process.env.SPOOL_BUNDLED_STATE;
if (!directory) throw new Error("Missing fixture state");
const runtime = await deterministicBundledRuntime(directory);
const request = runtime.request.bind(runtime);
runtime.request = async (input) => {
	if (input.kind === "permissions" && existsSync(join(directory, "reject-permissions")))
		throw new Error("spool refused this permission change.");
	return request(input);
};
serveBundledHost(runtime);
