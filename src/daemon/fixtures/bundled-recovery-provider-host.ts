import { serveBundledHost } from "../bundled-host-server";
import { recoveryRuntime } from "./bundled-recovery-provider";

const directory = process.env.SPOOL_BUNDLED_STATE;
if (directory === undefined) throw new Error("Missing fixture state");
void recoveryRuntime(directory).then(serveBundledHost);
