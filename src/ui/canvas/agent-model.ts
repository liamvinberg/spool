import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEngineId } from "../../daemon/agent-engine";
import { type AgentAsk, type AgentOffer, modelOf, modelsOf } from "../../daemon/agent-offer";
import { agentModelOffer, chooseAgentModel } from "../api";

/**
 * Which machine is answering, and what the menu may offer instead (#118, #199).
 *
 * Nothing in this file knows what a model is called. The names, the sentences and the
 * effort levels all arrive from the binary's own `list_models`, and the report is what
 * settles what is current — never what spool asked for. A control that renders its own
 * state is guessing; one that renders the report cannot be wrong, and it can be
 * overruled: an alias the binary does not take, an effort the environment holds, a model
 * that resolved to something else.
 *
 * The press is drawn in the meantime, and only in the meantime. Asking costs a spawn —
 * about a second cold — and a menu that sat unmoved for a second under a finger reads as
 * broken rather than as careful, so the row lights up and the readout moves at once. What
 * is on screen for that second is a claim spool is making, and it is a claim with an
 * expiry: the report replaces it whole the moment it lands, including where it says the
 * press was refused, which is what puts the line back.
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
 * The report with a press laid over it, which is what the menu draws until the reply.
 *
 * It asserts what the press asserts and not one thing more. The value is the row that was
 * pressed, so the highlight and the name move under the finger; the resolved id comes off
 * that row, because a row's own `resolvedModel` is true by the time it is offered. The
 * binary's product word for it does not, and is dropped rather than carried: `name` is the
 * fallback the readout uses when no offered row matches, and the old model's word for
 * itself under the new model's row is the one lie this could tell.
 *
 * Effort is only ever drawn where the model says the level exists. Switching to haiku
 * takes the level off the line in the same frame the control disappears, rather than
 * leaving `Haiku · high` up for a second on a model that reports no levels at all — and a
 * level the environment holds is not moved by a press here either, for the reason the rows
 * are dead: the change is refused before it is sent.
 */
export function pressedOffer(offer: AgentOffer, press: AgentAsk): AgentOffer {
	const value = press.value ?? offer.current.value;
	const model = modelOf(offer.models, value);
	const wanted = offer.current.pin ?? press.effort ?? offer.current.effort;
	const levels = model?.supportedEffortLevels ?? [];
	return {
		models: offer.models,
		current: {
			...offer.current,
			value,
			resolved: model?.resolvedModel ?? offer.current.resolved,
			name: model === undefined ? offer.current.name : null,
			effort: wanted !== null && levels.includes(wanted) ? wanted : null,
		},
	};
}

export interface AgentModelDeck {
	readonly engine?: AgentEngineId;
	readonly project?: string;
	readonly onEngine?: (engine: AgentEngineId) => void;
	readonly started?: boolean;
	readonly connect?: () => void;
	readonly accountOpen?: boolean;
	readonly closeAccount?: () => void;
	readonly offer: AgentOffer;
	/** The current chat has not received its own model offer yet. */
	readonly loading?: boolean;
	/** Await this chat's offer without treating an unanswered request as signed out. */
	readonly ready?: () => Promise<AgentOffer | null>;
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
 * Nothing is drawn about the first wait, and that wait is real — a cold spawn is about a
 * second. There is no state to draw before anything has been pressed: the readout is the
 * binary's report and the report does not exist yet, so anything on screen in that second
 * would be spool asserting a machine it has not been told about. A *press* is different,
 * because the press is the one thing spool does know, so it is held here beside the report
 * and drawn over it until the report catches up.
 *
 * The press is kept with the thread it was made about, so it never lands on a thread it
 * was not about. It is dropped whenever an answer to it arrives — including an answer that
 * arrives as nothing, which is the door failing, and which leaves the last true report on
 * screen rather than a claim nobody can now check.
 */
export function useAgentModel(project: string, thread: string, engine?: AgentEngineId): AgentModelDeck {
	const [accountOpen, setAccountOpen] = useState(false);
	const owner = JSON.stringify([project, thread, engine]);
	const activeOwner = useRef(owner);
	activeOwner.current = owner;
	const pending = useRef<{ owner: string; reply: Promise<AgentOffer | null> } | null>(null);
	const [reported, setReported] = useState<{ owner: string; offer: AgentOffer } | null>(null);
	/** the press no answer has come back for yet, and the thread it was made about */
	const [pressed, setPressed] = useState<{ owner: string; ask: AgentAsk } | null>(null);
	/** climbs per ask, which is what re-asks the binary when the menu opens */
	const [asked, setAsked] = useState(0);
	/** climbs per press, so a probe that was already in flight cannot land on a newer one */
	const presses = useRef(0);
	// biome-ignore lint/correctness/useExhaustiveDependencies: changing the owner retires outstanding choices even before its next offer arrives.
	useEffect(() => {
		presses.current += 1;
		setPressed(null);
	}, [owner]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `asked` is not read in here, it is the trigger — climbing it is what re-asks the binary
	useEffect(() => {
		// a thread with no id yet is the deck before it has minted one, and there is nothing
		// to ask about it
		if (thread === "") {
			setReported(null);
			return;
		}
		let live = true;
		const at = presses.current;
		const reply = agentModelOffer(project, thread, engine)
			.then(offerOf)
			.catch(() => null);
		pending.current = { owner, reply };
		void reply.then((read) => {
			// dropped where the rail moved on, and where a press went out after this ask did:
			// an answer to the older question knows nothing about the newer choice
			if (live && at === presses.current && read !== null) setReported({ owner, offer: read });
		});
		return () => {
			live = false;
		};
	}, [project, thread, asked, engine, owner]);

	const choose = useCallback(
		(next: AgentAsk) => {
			if (thread === "") return;
			presses.current += 1;
			const at = presses.current;
			// the press is drawn at once, because the reply is a spawn away and a control that
			// answers a second after the finger reads as broken. It is a claim and not a
			// record: what the binary reports is still the only thing that stays
			setPressed((held) => ({ owner, ask: held?.owner === owner ? { ...held.ask, ...next } : next }));
			void chooseAgentModel(project, thread, next, engine)
				.then((answered) => offerOf(answered))
				// a door that failed answers nothing, which is the same as an answer with nothing
				// in it here: the claim comes off the screen either way
				.catch(() => null)
				.then((read) => {
					// a newer press owns the readout, and its own reply is what will clear it
					if (at !== presses.current || activeOwner.current !== owner) return;
					if (read !== null) setReported({ owner, offer: read });
					setPressed(null);
				});
		},
		[project, thread, engine, owner],
	);

	// the press only ever answers for the thread it was made about, so a rail that moved
	// on draws the report it has rather than the last thread's finger
	const current = reported?.owner === owner ? reported.offer : NO_OFFER;
	const offer =
		engine === "spool" || pressed === null || pressed.owner !== owner ? current : pressedOffer(current, pressed.ask);

	return {
		...(engine === undefined ? {} : { engine }),
		project,
		accountOpen,
		connect: () => setAccountOpen(true),
		closeAccount: () => setAccountOpen(false),
		offer,
		loading: reported?.owner !== owner,
		ready: async () => {
			const at = presses.current;
			const read = pending.current?.owner === owner ? await pending.current.reply : null;
			return activeOwner.current === owner && at === presses.current ? read : null;
		},
		readout: modelReadout(offer),
		levels: effortLevels(offer),
		choose,
		refresh: useCallback(() => setAsked((count) => count + 1), []),
	};
}
