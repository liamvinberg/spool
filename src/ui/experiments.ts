declare global {
	interface Window {
		__SPOOL_EXPERIMENTS__?: readonly string[];
	}
}

/**
 * The experimental surfaces this machine has switched on (#238).
 *
 * The switch is a list of names in `~/.spool/config.json`, beside `updateCheck`,
 * and it rides the boot script the daemon already writes into the canvas
 * document. That is what makes an experiment absent rather than hidden: the page
 * knows before its first paint, so a surface that is off never renders once and
 * disappears, and there is nothing in the DOM for a key or a click to find.
 *
 * The daemon carries whatever the file said and never judges it, so the
 * vocabulary lives here. A name nothing on this side asks about does nothing —
 * a config written for a newer spool is not an error on an older one, and
 * neither is one written for an older spool naming a flag that has since
 * graduated. `agent-panel` is that: the agent is a surface the canvas has now
 * (#268), nothing asks about the name any more, and a machine still carrying it
 * in config.json boots exactly as it did.
 */
export type Experiment = "agent-panel";

export function experimentOn(name: Experiment): boolean {
	const enabled = typeof window === "undefined" ? undefined : window.__SPOOL_EXPERIMENTS__;
	return Array.isArray(enabled) && enabled.includes(name);
}
