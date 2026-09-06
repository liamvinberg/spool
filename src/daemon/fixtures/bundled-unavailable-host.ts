import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import { serveBundledHost } from "../bundled-host-server";
import { deterministicBundledRuntime } from "./bundled-provider";

// Only the missing-helper fact is simulated. Approvals, host, commands and UI remain real.
SandboxManager.checkDependenciesAsync = async () => ({ errors: ["Fixture missing helper"], warnings: [] });
const directory = process.env.SPOOL_BUNDLED_STATE;
if (directory === undefined) throw new Error("Missing fixture state");
void deterministicBundledRuntime(directory).then(serveBundledHost);
