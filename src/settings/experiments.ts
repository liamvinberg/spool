import { BETA } from "../channel";

/**
 * Spool's experimental features, declared once (#238, spool#423).
 *
 * A feature that ships before it is settled ships behind one entry here, and
 * every side reads that entry: the settings registry turns each one into a
 * machine setting (`experimental.<id>` in config.json), the Settings page draws
 * its Experimental section from them, the daemon boots the canvas with the ones
 * on, and `spool experiments` lists and flips them. Nothing else learns an id.
 *
 * A feature moves through two stages and then leaves:
 *
 * - `experimental`: off until somebody turns it on.
 * - `beta`: on for everyone, the switch kept as a way out.
 *
 * The default follows the stage, so the two can never disagree. A feature that
 * graduates, or that did not work, leaves by its entry being deleted: every
 * `experimentOn("<id>")` left in the code is then a type error, which is the
 * list of places to make unconditional or to remove. A config.json that still
 * names a deleted id boots exactly as before, the id is carried through every
 * write and read by nothing.
 */

export type ExperimentStage = "experimental" | "beta";

export interface ExperimentEntry {
	/** what its switch is called, in sentence case */
	readonly name: string;
	/** what it does, one sentence */
	readonly says: string;
	/** what it costs, or what is not yet known about it, one sentence */
	readonly tradeoff: string;
	readonly stage: ExperimentStage;
	/** where it is being decided */
	readonly ticket: string;
}

export const EXPERIMENTS = {
	"element-tree": {
		name: "Element tree",
		says: "The pages rail shows the open frame's elements while you edit, and selects them in the frame.",
		tradeoff: "Its direction is still open. Off, Edit leaves the rail as Select does.",
		stage: "experimental",
		ticket: "#238",
	},
	"fast-refresh": {
		name: "Fast refresh",
		says: "A saved edit swaps into the open frame, so it keeps its scroll, inputs and state instead of reloading.",
		tradeoff: "Frames that went hot run React's development build, a little slower until they reload.",
		stage: "experimental",
		ticket: "spool#218",
	},
	"frame-resolution": {
		name: "Frame resolution",
		says: "Live frames draw their canvases at the size they are shown, so a full canvas holds less memory.",
		tradeoff: "A short blur while a zoom in settles.",
		stage: "experimental",
		ticket: "spool#218",
	},
	record: {
		name: "Record",
		says: "Record a frame as you play it, and download it as an MP4 clip with its sound, ready to post.",
		tradeoff:
			"A clip renders after you stop, a few seconds for every second recorded. Frames that use Math.random may play back a little differently.",
		stage: "experimental",
		ticket: "spool#221",
	},
	deck: {
		name: "Decks",
		says: "A page holding a deck.json is a presentation: its top row is the talk, laid out by spool and kept in step as frames come and go.",
		tradeoff:
			"Spool writes the places of a deck's frames by itself whenever its files change. Off, a deck is an ordinary page.",
		stage: "experimental",
		ticket: "spool#265",
	},
	knobs: {
		name: "Knobs",
		says: "The Knobs section in the properties rail, for the values a frame declares with `ui.knobs`.",
		tradeoff: "Not tested thoroughly yet. Off, frames still run on the values in their code.",
		stage: "beta",
		ticket: "#220",
	},
} as const satisfies Record<string, ExperimentEntry>;

export type ExperimentId = keyof typeof EXPERIMENTS;
export const EXPERIMENT_IDS = Object.keys(EXPERIMENTS) as readonly ExperimentId[];

export function isExperimentId(name: string): name is ExperimentId {
	return Object.hasOwn(EXPERIMENTS, name);
}

/**
 * On for a beta, off for an experiment: what a machine that never chose gets. In a Spool Beta build (spool#282)
 * every one is on, each still switchable off in Settings.
 */
export function experimentDefault(id: ExperimentId, betaBuild = BETA): boolean {
	const stage: ExperimentStage = EXPERIMENTS[id].stage;
	return betaBuild || stage === "beta";
}

/** The setting an experiment is: `experimental.fast-refresh`, `{ "experimental": { "fast-refresh": true } }` on disk. */
export type ExperimentKey = `experimental.${ExperimentId}`;
export const experimentKey = (id: ExperimentId): ExperimentKey => `experimental.${id}`;

/** The experiment a setting key names, or nothing for any other key. */
export function experimentOfKey(key: string): ExperimentId | undefined {
	if (!key.startsWith("experimental.")) return undefined;
	const id = key.slice("experimental.".length);
	return isExperimentId(id) ? id : undefined;
}

/**
 * The ids config.json's old `experiments` list switches on: the list of names
 * #238 read, hand-written before there was a switch. It is still read as on,
 * under anything the `experimental` map says, and never written: an older
 * spool reads this list and refuses to boot on anything but one, so the map
 * lives under a key it has never heard of.
 */
export function legacyExperiments(config: Readonly<Record<string, unknown>>): ReadonlySet<string> {
	const list = config.experiments;
	return new Set(Array.isArray(list) ? list.filter((name): name is string => typeof name === "string") : []);
}

/** The experiments a settings read has on, the list the canvas boots with. */
export function experimentsOn(readings: readonly { readonly key: string; readonly value: unknown }[]): ExperimentId[] {
	const on: ExperimentId[] = [];
	for (const reading of readings) {
		const id = experimentOfKey(reading.key);
		if (id !== undefined && reading.value === true) on.push(id);
	}
	return on;
}
