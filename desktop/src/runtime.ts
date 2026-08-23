import { existsSync } from "node:fs";
import { join } from "node:path";

// The spool package that ships inside the bundle.
//
// The point of the app is that nobody has to install Node or run npm. Node is
// Electron's own binary under ELECTRON_RUN_AS_NODE, so the only thing fetched at
// build time is the published package, laid out here:
//
//   Spool.app/Contents/Resources/cli/spool/node_modules/spool.page/dist/cli.js
//   Spool.app/Contents/Resources/cli/RUNTIME.txt
//   Spool.app/Contents/Resources/shim/electron-argv.js
//
// The npm artifact is the published `spool.page` of this app's own version, so
// an installed app and `npx spool.page` are the same program. RUNTIME.txt records
// what went in, because "which spool is in there" is a question a bug report
// will ask.

export function bundledCli(resourcesPath: string): string | undefined {
	const cli = join(resourcesPath, "cli", "spool", "node_modules", "spool.page", "dist", "cli.js");
	return existsSync(cli) ? cli : undefined;
}

/**
 * The `-r` module the cli needs in front of it under Electron's node. Outside the
 * asar, because it is loaded by a child process's node options rather than by
 * this one's require.
 */
export function bundledShim(resourcesPath: string): string {
	return join(resourcesPath, "shim", "electron-argv.js");
}
