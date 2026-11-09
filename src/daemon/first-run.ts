import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SettingsStore } from "./settings";

/**
 * Whether spool's first run opens by itself (spool#250).
 *
 * Once per machine: on a machine that has never finished or skipped it (`onboarding.done`).
 * Somebody who used spool before it existed is never shown a welcome on an update: the
 * first daemon that serves it decides, once, from what the state folder already holds,
 * and writes the answer down, so it never changes with what they do later (forgetting
 * their last project included). Help's Run setup again opens it any time.
 *
 * A packaged build has it on. A spool run from its TypeScript source is a checkout, where
 * agents work, or a test, and stays quiet unless `SPOOL_FIRST_RUN=1` asks for it.
 */
export function firstRunServing(env: NodeJS.ProcessEnv, fromSource: boolean): boolean {
	return !fromSource || env.SPOOL_FIRST_RUN?.trim() === "1";
}

export function firstRunDue({
	serving,
	done,
}: {
	serving: boolean;
	/** `onboarding.done` on this machine */
	done: boolean;
}): boolean {
	return serving && !done;
}

/**
 * What a state folder holds once somebody has used spool from it: a project registered
 * or forgotten, tabs, a setting, a Spool Cloud sign-in, a thread or a comment. A daemon
 * that only started writes none of them (its `daemon.json` and log are not use).
 */
export const USED_STATE = ["registry.json", "session.json", "config.json", "cloud", "threads", "comments"] as const;

export function usedBefore(spoolDir: string): boolean {
	return USED_STATE.some((name) => existsSync(join(spoolDir, name)));
}

/**
 * Decide the first run for this machine, once: `onboarding.done` written true where the
 * state folder was used before this version, false where it is new. A machine that already
 * has it written keeps it.
 */
export function settleFirstRun(spoolDir: string, settings: SettingsStore): void {
	const done = settings.read().entries.find((entry) => entry.key === "onboarding.done");
	if (done?.source === "file") return;
	settings.write("onboarding.done", usedBefore(spoolDir));
}
