import type { SettingsStore } from "./daemon/settings";
import { SpoolError } from "./errors";
import { EXPERIMENT_IDS, EXPERIMENTS, experimentKey, isExperimentId } from "./settings/experiments";

/**
 * `spool experiments` (spool#423): the switches Settings › Experimental shows,
 * for an agent or a terminal, read and written through the same settings store
 * so the file, the page and this verb never disagree.
 */

/** Every experiment, its state on this machine, what it does and what it costs. */
export function listExperiments(store: SettingsStore): string {
	const entries = store.read().entries;
	const width = Math.max(...EXPERIMENT_IDS.map((id) => id.length));
	return EXPERIMENT_IDS.map((id) => {
		const experiment = EXPERIMENTS[id];
		const value: unknown = entries.find((entry) => entry.key === experimentKey(id))?.value;
		const on = value === true;
		return [
			`${id.padEnd(width)}  ${on ? "on " : "off"}  ${experiment.stage}`,
			`  ${experiment.says.replaceAll("`", "")}`,
			`  Trade-off: ${experiment.tradeoff}`,
		].join("\n");
	}).join("\n\n");
}

/** Switch one on or off in config.json, as its switch in Settings would. */
export function switchExperiment(store: SettingsStore, id: string, on: boolean): string {
	if (!isExperimentId(id)) {
		throw new SpoolError(`no experiment named "${id}": there is ${EXPERIMENT_IDS.join(", ")}`);
	}
	const written = store.write(experimentKey(id), on);
	if (!written.ok) throw new SpoolError(written.reason);
	return `${id} is ${on ? "on" : "off"}: reload the canvas to apply`;
}
