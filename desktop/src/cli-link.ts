import { spawn } from "node:child_process";
import { accessSync, constants, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { delimiter, join } from "node:path";

// The spool command for someone who installed the app and nothing else.
//
// The bundle carries a launcher at Resources/bin/spool, and the command is a
// symlink to it from /usr/local/bin: the one directory every macOS shell and
// launchd already have on PATH, so nobody's profile is edited. A link rather than
// a copy, so an app update is a command update and the two never disagree.
//
// Someone who installed spool with npm or pnpm keeps theirs. A `spool` elsewhere
// on their PATH, or a file at the link that the app did not put there, means the
// app stays out of the way.

export const LINK = "/usr/local/bin/spool";

export function launcherPath(resourcesPath: string): string {
	return join(resourcesPath, "bin", "spool");
}

/**
 * What is at the link now.
 *
 * `stale` is a link a Spool.app made that points somewhere other than this one's
 * launcher: an app that was moved, or a second copy. It is the app's to repoint.
 */
export type LinkState = "current" | "stale" | "absent" | "foreign";

export function linkState(launcher: string, link = LINK): LinkState {
	let target: string;
	try {
		target = readlinkSync(link);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "absent";
		// EINVAL: a file, not a link
		return "foreign";
	}
	if (target === launcher) return "current";
	return target.endsWith(".app/Contents/Resources/bin/spool") ? "stale" : "foreign";
}

/** A `spool` on PATH that is not the link, which means it was installed some other way. */
export function otherSpool(path: string | undefined, link = LINK): string | undefined {
	for (const directory of (path ?? "").split(delimiter)) {
		if (directory === "") continue;
		const candidate = join(directory, "spool");
		if (candidate === link) continue;
		try {
			accessSync(candidate, constants.X_OK);
			return candidate;
		} catch {
			// not here
		}
	}
	return undefined;
}

/** Link without asking, where the directory lets this user write. False when it does not. */
export function linkDirectly(launcher: string, link = LINK): boolean {
	try {
		try {
			unlinkSync(link);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		symlinkSync(launcher, link);
		return true;
	} catch {
		return false;
	}
}

/** An AppleScript string literal. */
function literal(text: string): string {
	return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/**
 * The same link through macOS's administrator prompt, which is the only way into
 * /usr/local/bin on a Mac where nothing has made it this user's. `-n` so a link
 * to a directory is replaced rather than followed. False when the person cancels.
 */
export function linkAsAdministrator(launcher: string, link = LINK): Promise<boolean> {
	const command = `"mkdir -p " & quoted form of ${literal(link.slice(0, link.lastIndexOf("/")))} & " && ln -sfn " & quoted form of ${literal(launcher)} & " " & quoted form of ${literal(link)}`;
	const script = `do shell script ${command} with prompt "Spool wants to add the spool command to your terminal." with administrator privileges`;
	// Not spawnSync: the prompt waits on a person, and the window must keep drawing meanwhile.
	return new Promise((resolve) => {
		const child = spawn("/usr/bin/osascript", ["-e", script], { stdio: "ignore" });
		child.on("error", () => resolve(false));
		child.on("exit", (code) => resolve(code === 0));
	});
}
