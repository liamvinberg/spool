import { useCallback, useEffect, useState } from "react";
import { type AgentAsk, type AgentOffer, modelOf, modelsOf } from "../../daemon/agent-offer";
import { agentModelOffer, chooseAgentModel } from "../api";

/**
 * Which machine is answering, and what the menu may offer instead (#118, #199).
 *
 * Nothing in this file knows what a model is called. The names, the sentences and the
 * effort levels all arrive from the binary's own `list_models`, and what is drawn as
 * current is what the binary reported when asked — never what spool asked for. A
 * control that renders its own state is guessing; one that renders the report cannot
 * be wrong, and it can be overruled: an alias the binary does not take, an effort the
 * environment holds, a model that resolved to something else.
 */

/** the offer before the binary has answered, so the footer has a shape from the first frame */
export const NO_OFFER: AgentOffer = {
	models: [],
	current: { value: null, resolved: null, name: null, effort: null, pin: null },
};

const string = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/**
 * One offer off the wire, or null where the door answered something else.
 *
 * Read rather than cast, for the reason the event union is: this is the far side of an
 * HTTP door, a daemon on another version can answer a different shape, and a rail that
 * threw on it would take the whole canvas with it. Null means keep what you had, which
 * is not the same as an offer with nothing in it.
 */
export function offerOf(body: unknown): AgentOffer | null {
	if (typeof body !== "object" || body === null) return null;
	const offer = body as { models?: unknown; current?: unknown };
	if (!Array.isArray(offer.models)) return null;
	const current = (typeof offer.current === "object" && offer.current !== null ? offer.current : {}) as Record<
		string,
		unknown
	>;
	return {
		// the same reader the daemon reads the reply with, rather than a second one here:
		// there is one tolerant reading of a row and it drops a row `/model` could not be
		// sent, which is exactly what a menu must not draw
		models: modelsOf(offer),
		current: {
			value: string(current.value),
			resolved: string(current.resolved),
			name: string(current.name),
			effort: string(current.effort),
			pin: string(current.pin),
		},
	};
}

/**
 * The effort levels the CLI describes, in its own words.
 *
 * The one table here spool carries rather than reads, and it is quoted rather than
 * written: `list_models` sends each model's *levels* but none of their descriptions,
 * and the only place the binary spells one out is the reply to `/effort <level>` —
 * which means setting it. So each was probed once, for zero turns and zero tokens, and
 * copied down verbatim. A level spool has never heard of gets no sentence rather than
 * a guessed one, and the menu draws whatever the model said it supports either way.
 *
 * `auto` is absent twice over: it has no description, and no model offers it in
 * `supportedEffortLevels` even though `/effort auto` is accepted. It stays reachable by
 * typing and out of the control.
 */
export const EFFORT_SAYS: Readonly<Record<string, string>> = {
	low: "Quick, straightforward implementation with minimal overhead",
	medium: "Balanced approach with standard implementation and testing",
	high: "Comprehensive implementation with extensive testing and documentation",
	xhigh: "Deeper reasoning than high, just below maximum (Fable 5, Opus 4.7+, Sonnet 5)",
	max: "Maximum capability with deepest reasoning. May use excessive tokens resulting in long response times or overthinking. Use sparingly for the hardest tasks.",
};

/**
 * The footer's one line: `Opus (1M context) · high`.
 *
 * The name truncates and never shortens, and the captured reply is what gives that
 * rule teeth. Five rows come back and **none of them is `Opus`**: there is `Default
 * (recommended)` and there is `Opus (1M context)`, both resolving to the same
 * `claude-opus-5[1m]`, and the parenthetical is the only thing telling them apart —
 * while `/model opus` is accepted and resolves to Opus *without* the 1M window. So
 * `Opus · high` in this line is not a short name for this machine, it is the correct
 * name of a different one printed under a transcript the other one wrote.
 *
 * An ellipsis is a different act, and the difference is not a technicality: the layout
 * ran out of room and said so, the whole string stays in the DOM, and the full name is
 * one click up in the menu. Nobody renamed anything.
 *
 * Effort only joins a model that says it supports effort, so on haiku the line is the
 * name alone. Where no offered row matches, the binary's own reported name is what is
 * left — still the machine's own word for itself.
 */
export function modelReadout(offer: AgentOffer): string {
	const model = modelOf(offer.models, offer.current.value);
	const name = model?.displayName ?? offer.current.name ?? offer.current.resolved;
	if (name === null) return "";
	if (offer.current.effort === null) return name;
	// the levels are the model's own claim about itself, and haiku claims none
	if (model !== undefined && model.supportsEffort !== true) return name;
	return `${name} · ${offer.current.effort}`;
}

/**
 * The levels the current model offers, which is data rather than a judgement.
 *
 * Empty on haiku, because the reply carries no `supportedEffortLevels` for it at all —
 * so the control is absent rather than present and inert. Nothing infers a default set
 * from the model's name.
 */
export function effortLevels(offer: AgentOffer): readonly string[] {
	return modelOf(offer.models, offer.current.value)?.supportedEffortLevels ?? [];
}

/**
 * The one sentence the menu is showing, for whatever the cursor is on (#186).
 *
 * `over` is one piece of state rather than two, because the slot is one slot: a model's
 * value and an effort level cannot collide, since the levels are a closed set the
 * binary names and a model value is an alias like `opus[1m]`. With nothing hovered it
 * describes the model that is set, which is the one thing the menu is already asserting
 * by highlighting a row — so the slot is never empty and never has to reserve for empty.
 *
 * A held effort level answers for the effort rows and for nothing else. It is the reason
 * they are dead, so it belongs where they are; said for every row it would stop the slot
 * describing what the cursor is on, and on a machine with the variable exported no
 * model's own sentence would ever be readable.
 */
export function menuSays(offer: AgentOffer, over: string | null): string {
	const asked = over ?? offer.current.value;
	if (asked === null) return "";
	const pin = offer.current.pin;
	// the block answers as well as its rows, because the rows it killed cannot report a
	// pointer at all: a disabled control fires no mouse event, so the one row anybody
	// hovers to ask "why can I not press this" would have had nothing to say
	if (pin !== null && (asked === pin || effortLevels(offer).includes(asked))) return pinSays(pin);
	return EFFORT_SAYS[asked] ?? modelOf(offer.models, asked)?.description ?? "";
}

export function pinSays(pin: string): string {
	return `CLAUDE_CODE_EFFORT_LEVEL=${pin} is set in the environment`;
}

/**
 * The tallest sentence this menu can be made to say, which is what it reserves room for.
 *
 * Everything it can say is the binary's own words and they are wildly uneven: `max`
 * runs 165 characters against `xhigh`'s 76 and `low`'s 57, and the model sentences are
 * longer again. With a bare minimum height the line grows by three as the cursor
 * crosses a row — and the menu opens upward, so growing moves its *top* edge and shoves
 * the list out of the frame. A pointer must never move what it is pointing at.
 */
export function menuLongest(offer: AgentOffer): string {
	const said = [
		...offer.models.map((model) => model.description),
		...effortLevels(offer).map((level) => EFFORT_SAYS[level] ?? ""),
		...(offer.current.pin === null ? [] : [pinSays(offer.current.pin)]),
	];
	return said.reduce((tallest, sentence) => (sentence.length > tallest.length ? sentence : tallest), "");
}

export interface AgentModelDeck {
	readonly offer: AgentOffer;
	/** the readout, and the trigger's own label */
	readonly readout: string;
	/** the levels the current model offers; empty means no control at all */
	readonly levels: readonly string[];
	readonly choose: (next: AgentAsk) => void;
	/** ask again, which is what opening the menu does */
	readonly refresh: () => void;
}

/**
 * The menu's contents, asked for rather than shipped (#199).
 *
 * Asked when the rail opens a thread, so the footer has something true to say before
 * anything is clicked, and asked again whenever the menu opens, because the answer is the
 * installed CLI's and a developer who upgraded mid-session should see what they now have.
 * A choice is the same request with the change in it: what comes back is the binary's
 * report, and that is the only thing that moves the readout.
 *
 * Per thread (#200), which is what the answer is about: the rows come back the same for
 * every thread and which of them is answering does not, so switching thread re-asks
 * rather than carrying the last one's model across.
 *
 * Nothing is drawn about the wait, and the wait is real — a cold spawn is about a
 * second. There is no state to draw: the readout is the binary's report and the report
 * does not exist yet, so anything on screen in that second would be spool asserting a
 * machine it has not been told about, which is the one thing this surface refuses.
 */
export function useAgentModel(project: string, thread: string): AgentModelDeck {
	const [offer, setOffer] = useState<AgentOffer>(NO_OFFER);
	/** climbs per ask, which is what re-asks the binary when the menu opens */
	const [asked, setAsked] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `asked` is not read in here, it is the trigger — climbing it is what re-asks the binary
	useEffect(() => {
		// a thread with no id yet is the deck before it has minted one, and there is nothing
		// to ask about it
		if (thread === "") {
			setOffer(NO_OFFER);
			return;
		}
		let live = true;
		void agentModelOffer(project, thread).then((answered) => {
			const read = offerOf(answered);
			// an answer that arrived after the rail moved on is dropped rather than drawn
			if (live && read !== null) setOffer(read);
		});
		return () => {
			live = false;
		};
	}, [project, thread, asked]);

	const choose = useCallback(
		(next: AgentAsk) => {
			if (thread === "") return;
			void chooseAgentModel(project, thread, next).then((answered) => {
				const read = offerOf(answered);
				// the reply moves the readout and the press does not, which is what keeps the
				// footer from ever saying a machine the binary refused
				if (read !== null) setOffer(read);
			});
		},
		[project, thread],
	);

	return {
		offer,
		readout: modelReadout(offer),
		levels: effortLevels(offer),
		choose,
		refresh: useCallback(() => setAsked((count) => count + 1), []),
	};
}
