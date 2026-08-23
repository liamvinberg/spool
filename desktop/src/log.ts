import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// A line per thing the app does, in the state directory beside the daemon's own
// log. Without it, "it did not open my canvas" has nowhere to be answered from:
// a packaged app has no console anyone will ever see.
//
// Never the control token, and never a project path. The token is a credential
// and a path is somebody's work. Pids, ports, versions and verdicts only.

let file: string | undefined;

export function openLog(directory: string): void {
	file = join(directory, "app.log");
	try {
		mkdirSync(directory, { recursive: true });
	} catch {
		// an unwritable state directory is the daemon's problem to report, not
		// a reason for the window not to open
	}
}

export function log(...fields: readonly string[]): void {
	if (file === undefined) return;
	const line = [new Date().toISOString(), ...fields].join("\t");
	try {
		appendFileSync(file, `${line}\n`);
	} catch {
		// logging is never worth a crash
	}
}
