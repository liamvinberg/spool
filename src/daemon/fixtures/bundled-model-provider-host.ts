import { serveBundledHost } from "../bundled-host-server";
import { deterministicModelRuntime } from "./bundled-model-provider";

const directory = process.env.SPOOL_BUNDLED_STATE;
if (!directory) throw new Error("Missing host state");
const runtime = await deterministicModelRuntime(directory);
await runtime.request({ kind: "connect", provider: "openai", key: "fixture-openai" });
await runtime.request({ kind: "connect", provider: "google", key: "fixture-google" });
serveBundledHost(runtime);
