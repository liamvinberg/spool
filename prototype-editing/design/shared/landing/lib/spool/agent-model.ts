export type Effort = "auto" | "low" | "medium" | "high" | "xhigh" | "max";

export interface Engine {
	readonly id: string;
	readonly label: string;
	/** false greys the row rather than failing at submit — `agent-native`'s `configured` */
	readonly configured: boolean;
	readonly note?: string | undefined;
}

export interface ModelState {
	readonly engine: string;
	/** the `value` of an offered choice, which is also what `/model` takes */
	readonly value: string;
	readonly effort: Effort;
}

import claudeModels from "./claude-models.json";

export interface ClaudeModel {
	readonly value: string;
	readonly resolvedModel: string;
	readonly displayName: string;
	readonly description: string;
	readonly supportsEffort?: boolean;
	readonly supportedEffortLevels?: readonly Effort[];
	readonly supportsFastMode?: boolean;
	readonly supportsAdaptiveThinking?: boolean;
	readonly supportsAutoMode?: boolean;
}

export function useModels(): readonly ClaudeModel[] {
	return claudeModels as readonly ClaudeModel[];
}

export function modelOf(models: readonly ClaudeModel[] | undefined, value: string): ClaudeModel | undefined {
	return models?.find((model) => model.value === value);
}

export const EFFORT_SAYS: Readonly<Record<Effort, string | null>> = {
	auto: null,
	low: "Quick, straightforward implementation with minimal overhead",
	medium: "Balanced approach with standard implementation and testing",
	high: "Comprehensive implementation with extensive testing and documentation",
	xhigh: "Deeper reasoning than high, just below maximum (Fable 5, Opus 4.7+, Sonnet 5)",
	max: "Maximum capability with deepest reasoning. May use excessive tokens resulting in long response times or overthinking. Use sparingly for the hardest tasks.",
};

export const ENGINES: readonly Engine[] = [
	{ id: "claude", label: "claude code", configured: true },
	{ id: "codex", label: "codex", configured: false, note: "needs the acp adapter" },
	{ id: "opencode", label: "opencode", configured: false, note: "needs the acp adapter" },
];

export function engineLabel(id: string): string {
	return ENGINES.find((entry) => entry.id === id)?.label ?? id;
}

export const CAPTURED: ModelState = { engine: "claude", value: "opus[1m]", effort: "high" };

export function readout(state: ModelState, models: readonly ClaudeModel[] | undefined): string {
	const model = modelOf(models, state.value);
	if (model === undefined) return state.value;
	return model.supportsEffort === true ? `${model.displayName} · ${state.effort}` : model.displayName;
}
