import { execFile } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";

export interface AgentAppLauncher {
	available(): boolean;
	open(root: string): Promise<void>;
}

/** The documented macOS workspace handoff. Never invoke the install-on-missing path. */
export function createAgentAppLauncher({
	platform = process.platform,
	path = process.env.PATH ?? "",
	home = homedir(),
	exists = existsSync,
	runnable = (file: string) => {
		try {
			accessSync(file, constants.X_OK);
			return true;
		} catch {
			return false;
		}
	},
	run = (command: string, args: string[], cwd: string) =>
		new Promise<void>((resolve, reject) => {
			execFile(command, args, { cwd, timeout: 10_000, maxBuffer: 64 * 1024 }, (error) => {
				if (error)
					reject(new Error("Could not open ChatGPT. Copy the project path and open the folder in the app."));
				else resolve();
			});
		}),
}: {
	platform?: NodeJS.Platform;
	path?: string;
	home?: string;
	exists?: (file: string) => boolean;
	runnable?: (file: string) => boolean;
	run?: (command: string, args: string[], cwd: string) => Promise<void>;
} = {}): AgentAppLauncher {
	const command = () => {
		if (platform !== "darwin") return undefined;
		if (!["/Applications", join(home, "Applications")].some((dir) => exists(join(dir, "ChatGPT.app"))))
			return undefined;
		return path
			.split(delimiter)
			.filter(isAbsolute)
			.map((dir) => join(dir, "codex"))
			.find(runnable);
	};
	return {
		available: () => command() !== undefined,
		open: async (root) => {
			const binary = command();
			if (binary === undefined)
				throw new Error(
					"Opening directly needs ChatGPT and the Codex CLI on this Mac. Copy the project path instead.",
				);
			await run(binary, ["app", root], root);
		},
	};
}
