import { serveBundledHost } from "../bundled-host-server";
import { deterministicAuth } from "./bundled-auth-provider";
import { deterministicBundledRuntime } from "./bundled-provider";

const directory = process.env.SPOOL_BUNDLED_STATE;
if (!directory) throw new Error("Missing host state");
const runtime = await deterministicBundledRuntime(directory);
deterministicAuth(runtime.models);
serveBundledHost(runtime);
