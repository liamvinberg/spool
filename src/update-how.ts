/**
 * How this Spool is updated (#206): the Mac app updates itself and the spool command it carries; anything else is the
 * npm package. Read off the running CLI's real path, as `spool upgrade` reads it.
 */

import { realpathSync } from "node:fs";

/** The command that updates an npm install of Spool. */
export const NPM_UPDATE_COMMAND = "npm install -g spool.page@latest";

/** Whether a CLI's real path is the Mac app's own copy, which the app replaces when it updates. */
export function cameWithApp(realCliPath: string): boolean {
	return realCliPath.includes(".app/Contents/Resources/cli/");
}

/** How a person updates the Spool running from this CLI: from the Mac app, or with the npm command. */
export type UpdateHow = { how: "app" } | { how: "cli"; command: string };

export function howToUpdate(realCliPath: string | undefined): UpdateHow {
	return realCliPath !== undefined && cameWithApp(realCliPath)
		? { how: "app" }
		: { how: "cli", command: NPM_UPDATE_COMMAND };
}

/** What the Sync box, the log and an agent's next command say first of a copy paused for an update. */
export function updateLine(team: string): string {
	return `Update Spool to keep syncing with ${team}`;
}

/** The same, with how to do it, for a terminal or a log that has no button. */
export function updateLineWithHow(team: string, how: UpdateHow): string {
	return how.how === "app"
		? `${updateLine(team)}: Check for Updates in the Spool app`
		: `${updateLine(team)}: run \`${how.command}\``;
}

/** The real path of the CLI this process runs from, if it can be read. */
export function runningCli(): string | undefined {
	const cli = process.argv[1];
	if (cli === undefined) return undefined;
	try {
		return realpathSync(cli);
	} catch {
		return undefined;
	}
}
