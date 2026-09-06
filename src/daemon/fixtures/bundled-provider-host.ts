import { serveBundledHost } from "../bundled-host-server";
import { deterministicBundledRuntime } from "./bundled-provider";

const directory = process.env.SPOOL_BUNDLED_STATE;
if (directory === undefined) throw new Error("Missing fixture state");
void deterministicBundledRuntime(directory).then(serveBundledHost);
