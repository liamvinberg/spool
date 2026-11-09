/**
 * Whether spool's first run opens by itself (spool#250).
 *
 * Once per machine: on a machine that has never finished or skipped it (`onboarding.done`)
 * and has no project yet, so somebody who has been using spool since before it existed is
 * not shown a welcome on their next update. Help's Run setup again opens it any time.
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
	projects,
}: {
	serving: boolean;
	/** `onboarding.done` on this machine */
	done: boolean;
	/** how many projects this machine has registered */
	projects: number;
}): boolean {
	return serving && !done && projects === 0;
}
