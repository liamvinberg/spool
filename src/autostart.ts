import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SpoolError } from "./errors";

/**
 * Start-on-login for the daemon: a per-user macOS LaunchAgent running
 * `spool serve --foreground`. RunAtLoad answers the reboot gap a browser
 * never can; KeepAlive is crash-only, so `spool stop` stays stopped and an
 * occupied port reads as a clean stand-down, never a revive loop. Paths are
 * baked absolute — launchd offers no usable PATH — so a Node upgrade that
 * moves the binary wants `spool autostart` run once more.
 */

export const AUTOSTART_LABEL = "page.spool.daemon";

export function launchAgentPath(home: string): string {
	return join(home, "Library", "LaunchAgents", `${AUTOSTART_LABEL}.plist`);
}

/** launchctl's name for the job inside the user's gui domain. */
const serviceTarget = (uid: number): string => `gui/${uid}/${AUTOSTART_LABEL}`;

export interface LaunchAgentSpec {
	/** absolute node binary */
	execPath: string;
	/** loader flags a dev checkout rides on (tsx); empty for the built cli */
	execArgv: string[];
	/** absolute cli entry */
	cliPath: string;
	/** where launchd sends the daemon's stdout and stderr */
	logFile: string;
}

const escapeXml = (value: string): string =>
	value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function launchAgentPlist({ execPath, execArgv, cliPath, logFile }: LaunchAgentSpec): string {
	const args = [execPath, ...execArgv, cliPath, "serve", "--foreground"];
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${AUTOSTART_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
${args.map((arg) => `\t\t<string>${escapeXml(arg)}</string>`).join("\n")}
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<dict>
		<key>SuccessfulExit</key>
		<false/>
	</dict>
	<key>StandardOutPath</key>
	<string>${escapeXml(logFile)}</string>
	<key>StandardErrorPath</key>
	<string>${escapeXml(logFile)}</string>
</dict>
</plist>
`;
}

export type LaunchctlRun = (args: string[]) => { status: number; stderr: string };

const runLaunchctl: LaunchctlRun = (args) => {
	const result = spawnSync("launchctl", args, { encoding: "utf8" });
	if (result.error !== undefined) throw new SpoolError(`cannot run launchctl: ${result.error.message}`);
	return { status: result.status ?? 1, stderr: result.stderr ?? "" };
};

export interface InstallOptions {
	home: string;
	uid: number;
	spec: LaunchAgentSpec;
	/** created if missing — launchd needs the log file's directory to exist */
	spoolDir: string;
	run?: LaunchctlRun;
}

/** Write the agent and hand it to launchd; returns the plist path. */
export function installAutostart({ home, uid, spec, spoolDir, run = runLaunchctl }: InstallOptions): string {
	const plist = launchAgentPath(home);
	mkdirSync(dirname(plist), { recursive: true });
	mkdirSync(spoolDir, { recursive: true });
	writeFileSync(plist, launchAgentPlist(spec));
	run(["bootout", serviceTarget(uid)]); // best-effort: clear any previous incarnation
	run(["enable", serviceTarget(uid)]); // best-effort: undo an old disable, or bootstrap refuses
	const bootstrap = run(["bootstrap", `gui/${uid}`, plist]);
	if (bootstrap.status !== 0) {
		throw new SpoolError(`launchctl bootstrap failed: ${bootstrap.stderr.trim() || `status ${bootstrap.status}`}`);
	}
	return plist;
}

export interface RemoveOptions {
	home: string;
	uid: number;
	run?: LaunchctlRun;
}

export type RemoveResult = { removed: true; plist: string } | { removed: false };

/** Goal-state removal: boot out whatever is loaded, delete the agent. */
export function removeAutostart({ home, uid, run = runLaunchctl }: RemoveOptions): RemoveResult {
	const plist = launchAgentPath(home);
	const existed = existsSync(plist);
	run(["bootout", serviceTarget(uid)]); // best-effort even without a plist: strays die too
	rmSync(plist, { force: true });
	return existed ? { removed: true, plist } : { removed: false };
}
