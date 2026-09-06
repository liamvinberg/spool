import { useCallback, useEffect, useState } from "react";
import type { AgentEngineId } from "../../daemon/agent-engine";
import type { AgentRecovery } from "../../daemon/agent-events";
import { fetchAgentInstalled } from "../api";

/**
 * The two ways there is no agent to talk to, on the rail's side (#127, #201).
 *
 * They are two questions rather than one, because they are not knowable in the same way.
 * Whether there is a command is a fact about this machine, so spool looks and knows it
 * before anybody types. Whether it is signed in is a fact inside another product: spool
 * reads none of the agent's private credential or config files to find that out, because
 * that is spool parsing a format it does not own and breaking the week it changes, so it
 * asks by spawning — which is the thing it was going to do anyway — and what comes back is
 * the binary's own refusal.
 *
 * Which is why the words here are in two groups and only one of them is spool's. The
 * refusal is quoted verbatim. The remedy is spool's own sentence, because the binary's
 * remedy is a slash command inside its interactive session and spool spawns print mode,
 * where there is no session to type it into.
 *
 * The words live in this module rather than beside either surface, because three places
 * need them and none of them may import the others: the fold reads a refusal to write the
 * remedy under it, the thread's mark reads it to know it is stuck, and the strip reads it
 * to offer the check.
 */

/**
 * The binary's own words for a login that is not there, verbatim from 2.1.220.
 *
 * All four are real strings in the installed binary. What is matched is the agent's own
 * sentence rather than a shape spool invented, which is the same law the todos, the model
 * menu and the usage windows are under: the thing that knows supplies the phrasing.
 */
const REFUSALS: readonly string[] = [
	"Not logged in",
	"Please run /login",
	"Invalid API key",
	"No authentication available",
];

/** the turn bounced off a login rather than off anything else */
export function signedOut(words: string): boolean {
	return REFUSALS.some((refusal) => words.includes(refusal));
}

/** spool's own word for a check that came back with the same answer */
export const STILL_OUT = "still signed out";

/** whose login it turned out to be, said once, at the moment spool starts using it */
export function signedInAs(account: string | null): string {
	return account === null ? "signed in" : `signed in as ${account}`;
}

/**
 * Signed out, which is a standing fact and one thing to do about it.
 *
 * The strip's own state. It is built out of the open thread's log rather than in here,
 * because the refusal lands in the log and the log is the only place that knows.
 */
export interface LoginDeck {
	/** the turn that ran bounced off a login */
	readonly out: boolean;
	readonly recovery?: AgentRecovery | null;
	readonly retry?: () => void;
	/** true while the check is out */
	readonly checking: boolean;
	/** ask again; on a yes the held prompt goes where it was always going */
	readonly check: () => void;
}

/** what the wall is drawn from: whether spool found an agent, and what a press did */
export interface InstallDeck {
	/** spool looked and there is nothing to spawn */
	readonly missing: boolean;
	readonly checking: boolean;
	/** the last look came back without one, which is allowed and says so */
	readonly foundNothing: boolean;
	readonly look: () => void;
}

/**
 * The look behind the wall, which is allowed to keep failing.
 *
 * Installing an agent takes minutes rather than the second a login takes, so this is not a
 * door that opens on the second knock: pressing it twice in a row is the normal case. It
 * goes out, comes back with the same answer, and says so in one quiet line, which is the
 * honest outcome and also the only way the button proves it did anything at all.
 *
 * It never guesses in either direction. A wall is spool saying it looked, so only a look
 * that came back with an answer moves one: a door that said nothing leaves the rail
 * exactly as it found it, rather than putting a wall over a working agent or taking one
 * down on a machine that still has nothing on it.
 */
export function useAgentInstall(project: string, engine?: AgentEngineId, thread?: string): InstallDeck {
	const [missing, setMissing] = useState(false);
	const [checking, setChecking] = useState(false);
	const [foundNothing, setFoundNothing] = useState(false);

	useEffect(() => {
		let gone = false;
		void fetchAgentInstalled(project, engine, thread).then((there) => {
			if (!gone && there !== null) setMissing(!there);
		});
		return () => {
			gone = true;
		};
	}, [project, engine, thread]);

	const look = useCallback(() => {
		if (checking) return;
		setChecking(true);
		setFoundNothing(false);
		void fetchAgentInstalled(project, engine, thread).then((there) => {
			setChecking(false);
			if (there !== null) setMissing(!there);
			// the press left a mark whenever it did not turn one up, which includes a door
			// that could not answer: what it says is that there is still nothing to talk to
			setFoundNothing(there !== true);
		});
	}, [project, checking, engine, thread]);

	return { missing, checking, foundNothing, look };
}
