import { useCallback, useEffect, useState } from "react";
import type { PlayEntry } from "./turn-play";

/**
 * What a model picker picks from, and who knows it.
 *
 * Not Spool. The binary knows, and it answers a question:
 *
 *   → {"type":"control_request","request_id":"req_1",
 *      "request":{"subtype":"list_models"}}
 *   ← {"models":[{"value":"opus[1m]","resolvedModel":"claude-opus-5[1m]",
 *                 "displayName":"Opus (1M context)",
 *                 "description":"Opus 5 with 1M context · Best for everyday, complex tasks",
 *                 "supportsEffort":true,
 *                 "supportedEffortLevels":["low","medium","high","xhigh","max"], …}, …]}
 *
 * `list_models` is a control request on the running session, so the list is
 * structured JSON rather than a sentence to parse, and it is the installed
 * binary's answer rather than a table Spool shipped. A new model appears because
 * the developer updated their CLI. A retired one disappears the same way. Spool
 * never cuts a release for either, and there is nothing to cache: the reply
 * arrives on a session that is already open.
 *
 * shared/fixtures/claude-models.json is that reply, captured whole.
 *
 * **It answers with five choices, not with ten aliases.** `/model`'s usage line
 * accepts `sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m],
 * opusplan, default`; `list_models` offers five. The difference is inputs versus
 * choices, and it deletes two axes a picker would otherwise have invented:
 *
 *   policies         `default` comes back as an ordinary row reading `Default
 *                    (recommended)`. `best` and `opusplan` are not offered at
 *                    all. There is no models-versus-policies split to draw.
 *   context window   `opus[1m]` is one entry called `Opus (1M context)`. Not a
 *                    model with a width switch beside it. One row.
 *
 * **Effort is per model, as data.** Each entry carries `supportsEffort` and its
 * own `supportedEffortLevels`. `haiku` carries neither, so on haiku there is no
 * effort control to draw — which is the last thing that was a judgement call
 * about effort becoming a fact instead.
 *
 * Every row also ships its own `displayName` and `description`, so the menu is
 * written by the binary. That is the todo rule once more: the thing that knows
 * supplies the phrasing, and the rail never invents a friendlier one.
 */

export type Effort = "auto" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * One offered choice, exactly as `list_models` returns it.
 *
 * Optional where the reply omits rather than falsifies: `haiku` has no
 * `supportsEffort` key at all, so absence is the signal.
 */
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

/** the mock answers relative URLs out of shared/fixtures, so the reply is one fetch away */
export function useModels(): readonly ClaudeModel[] | undefined {
	const [models, setModels] = useState<readonly ClaudeModel[] | undefined>(undefined);
	useEffect(() => {
		let live = true;
		void fetch("/api/claude-models")
			.then((response) => response.json() as Promise<readonly ClaudeModel[]>)
			.then((body) => {
				if (live) setModels(body);
			})
			.catch((reason: unknown) => console.error("claude-models did not load", reason));
		return () => {
			live = false;
		};
	}, []);
	return models;
}

export function modelOf(models: readonly ClaudeModel[] | undefined, value: string): ClaudeModel | undefined {
	return models?.find((model) => model.value === value);
}

/**
 * The effort levels the CLI describes, in its own words.
 *
 * Probed one at a time, each for zero turns and zero tokens. `auto` is the odd
 * one twice over: it has no description, and `list_models` does not offer it in
 * any model's `supportedEffortLevels` even though `/effort auto` is accepted. The
 * menu renders what the model says it supports, so `auto` stays reachable by
 * typing and out of the control.
 */
export const EFFORT_SAYS: Readonly<Record<Effort, string | null>> = {
	auto: null,
	low: "Quick, straightforward implementation with minimal overhead",
	medium: "Balanced approach with standard implementation and testing",
	high: "Comprehensive implementation with extensive testing and documentation",
	xhigh: "Deeper reasoning than high, just below maximum (Fable 5, Opus 4.7+, Sonnet 5)",
	max: "Maximum capability with deepest reasoning. May use excessive tokens resulting in long response times or overthinking. Use sparingly for the hardest tasks.",
};

export interface Engine {
	readonly id: string;
	readonly label: string;
	/** false greys the row rather than failing at submit — `agent-native`'s `configured` */
	readonly configured: boolean;
	readonly note?: string | undefined;
}

/**
 * The engine axis, and the one list on this screen that is honestly Spool's.
 *
 * It is the mirror image of the model list. Which engines exist is a fact about
 * which adapters Spool ships, so it changes only when Spool changes — a fixed
 * list is correct by construction rather than a staleness risk. #115 settled the
 * order: Claude Code hand-written over `stream-json` first, ACP second reaching
 * both of the others, Codex natively third only if the quota meter demands it.
 *
 * It is also the only axis that cannot switch mid-thread at all. A different
 * engine is a different binary, a different process and a different session id,
 * so picking one does not change who answers next: it ends the conversation and
 * starts another.
 */
export const ENGINES: readonly Engine[] = [
	{ id: "claude", label: "claude code", configured: true },
	{ id: "codex", label: "codex", configured: false, note: "needs the acp adapter" },
	{ id: "opencode", label: "opencode", configured: false, note: "needs the acp adapter" },
];

export function engineLabel(id: string): string {
	return ENGINES.find((entry) => entry.id === id)?.label ?? id;
}

export interface ModelState {
	readonly engine: string;
	/** the `value` of an offered choice, which is also what `/model` takes */
	readonly value: string;
	readonly effort: Effort;
}

/** what the capture was running: `"model":"claude-opus-5[1m]"` at `system/init` */
export const CAPTURED: ModelState = { engine: "claude", value: "opus[1m]", effort: "high" };

/**
 * The footer's one line: `Opus (1M context) · high`.
 *
 * The name is the binary's `displayName`, uncased and unshortened, because the
 * moment Spool rewrites it Spool owns it. Effort only appears on a model that
 * says it supports effort, so on haiku the line is just the name.
 */
export function readout(state: ModelState, models: readonly ClaudeModel[] | undefined): string {
	const model = modelOf(models, state.value);
	if (model === undefined) return state.value;
	return model.supportsEffort === true ? `${model.displayName} · ${state.effort}` : model.displayName;
}

/* ---------- the replies, as the binary writes them ---------- */

export const MODEL_USAGE =
	"Usage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.";
export const EFFORT_USAGE = "Usage: /effort <low|medium|high|xhigh|max|auto>";

/**
 * Two aliases the usage line accepts that `list_models` does not offer, kept
 * because the frame prints that usage line and a frame that lists a name it then
 * rejects is lying in its own transcript. Both replies were probed.
 */
const EXTRA: Readonly<Record<string, string>> = {
	best: "Fable 5",
	opusplan: "Opus in plan mode, else Sonnet",
};

/**
 * The environment beats the control, and says so.
 *
 * Measured: with `CLAUDE_CODE_EFFORT_LEVEL=max` exported, `/effort xhigh` refuses
 * and names the variable holding it. #115 settled that the daemon spawns the
 * developer's binary and inherits their environment, so what they exported
 * outranks anything Spool draws. A control that renders its own state is
 * guessing; one that renders the reply cannot be wrong.
 */
function effortPinned(pin: Effort, wanted: Effort): string {
	return `CLAUDE_CODE_EFFORT_LEVEL=${pin} overrides this session — clear it and ${wanted} takes over`;
}

function effortSet(level: Effort): string {
	const says = EFFORT_SAYS[level];
	if (says === null) return `Effort level set to ${level} (this session only)`;
	return `Set effort level to ${level} (this session only): ${says}`;
}

export type Slash =
	| { readonly kind: "model"; readonly value: string; readonly reply: string }
	| { readonly kind: "effort"; readonly effort: Effort; readonly reply: string }
	/** answered and printed back, changing nothing */
	| { readonly kind: "reply"; readonly text: string }
	/** not a command: it is a prompt, and it goes to the agent verbatim */
	| null;

/**
 * What the composer already is.
 *
 * `/model sonnet` and `/effort xhigh` are not features to build: they are
 * messages the binary answers before the model ever sees them, for zero turns and
 * zero tokens. The menu is a shortcut for one of them, never a second source of
 * truth.
 */
export function parseSlash(
	text: string,
	state: ModelState,
	models: readonly ClaudeModel[] | undefined,
	pin: Effort | null,
): Slash {
	const words = text.trim().split(/\s+/);
	const head = words[0];
	const arg = words[1];
	if (head === "/model") {
		if (arg === undefined) {
			return { kind: "reply", text: `Current model: ${readout(state, models)}\n${MODEL_USAGE}` };
		}
		const offered = modelOf(models, arg);
		if (offered !== undefined) {
			return { kind: "model", value: arg, reply: `Set model to ${offered.displayName} for this session only` };
		}
		const extra = EXTRA[arg];
		if (extra !== undefined) return { kind: "reply", text: `Set model to ${extra} for this session only` };
		return { kind: "reply", text: MODEL_USAGE };
	}
	if (head === "/effort") {
		const levels = Object.keys(EFFORT_SAYS) as readonly Effort[];
		const found = levels.find((level) => level === arg);
		if (found === undefined) return { kind: "reply", text: EFFORT_USAGE };
		if (pin !== null) return { kind: "reply", text: effortPinned(pin, found) };
		return { kind: "effort", effort: found, reply: effortSet(found) };
	}
	return null;
}

/** a note carries the run it was made during, so it lands on the right side of the turn */
interface Note {
	readonly key: string;
	readonly text: string;
	/** the command that caused it, when a human typed one */
	readonly said: string | null;
	readonly rule: boolean;
	readonly run: number;
}

export interface ModelDeck {
	readonly state: ModelState;
	readonly models: readonly ClaudeModel[] | undefined;
	/** the effort the environment has pinned, which no control can move */
	readonly pin: Effort | null;
	/** notes made before this turn started */
	readonly before: readonly PlayEntry[];
	/** notes made during or after it */
	readonly after: readonly PlayEntry[];
	/** a click on a control: switches, and leaves the rule behind */
	readonly pick: (next: Partial<ModelState>) => void;
	/** a line out of the composer: true if it was a command and the caller should not send it */
	readonly say: (text: string) => boolean;
}

/**
 * The switch, and the trace it leaves.
 *
 * A transcript that spans two models and says so nowhere is a lie about who said
 * what, so a switch writes a rule across the log. Typing the command needs no
 * rule: the command is already in the transcript as your own line, with the
 * binary's reply under it.
 */
export function useModel(initial: ModelState, run: number, pin: Effort | null = null): ModelDeck {
	const models = useModels();
	const [state, setState] = useState(initial);
	const [notes, setNotes] = useState<readonly Note[]>([]);

	const write = useCallback((text: string, rule: boolean, at: number, said: string | null = null) => {
		setNotes((prev) => [...prev, { key: `note-${prev.length}`, text, said, rule, run: at }]);
	}, []);

	const pick = useCallback(
		(next: Partial<ModelState>) => {
			const merged = { ...state, ...next };
			if (merged.engine === state.engine && merged.value === state.value && merged.effort === state.effort) return;
			if (merged.effort !== state.effort && pin !== null) {
				write(effortPinned(pin, merged.effort), false, run);
				return;
			}
			setState(merged);
			const line = readout(merged, models);
			write(merged.engine === state.engine ? line : `${engineLabel(merged.engine)} · ${line}`, true, run);
		},
		[models, pin, run, state, write],
	);

	const say = useCallback(
		(text: string) => {
			const slash = parseSlash(text, state, models, pin);
			if (slash === null) return false;
			if (slash.kind === "reply") {
				write(slash.text, false, run, text.trim());
				return true;
			}
			setState(slash.kind === "model" ? { ...state, value: slash.value } : { ...state, effort: slash.effort });
			write(slash.reply, false, run, text.trim());
			return true;
		},
		[models, pin, run, state, write],
	);

	const entries = (kept: (note: Note) => boolean): readonly PlayEntry[] =>
		notes.filter(kept).map((note) => ({
			key: note.key,
			kind: "note" as const,
			text: note.text,
			rule: note.rule,
			...(note.said === null ? {} : { said: note.said }),
		}));

	return {
		state,
		models,
		pin,
		before: entries((note) => note.run < run),
		after: entries((note) => note.run >= run),
		pick,
		say,
	};
}
