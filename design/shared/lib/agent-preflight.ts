import { useCallback, useState } from "react";
import type { PlayEntry } from "shared/lib/turn-play";

/**
 * The agent that isn't there, and which half of that is Spool's to know.
 *
 * #115 settled that Spool spawns the developer's own installed binary and reuses
 * whatever login is already on the machine. That makes the absence of a binary,
 * and the state of its login, ordinary states of the rail rather than error
 * paths. The question is what the rail shows in each — and the answer splits,
 * because the two facts are not knowable in the same way.
 *
 *   is there a command       a fact about this machine's PATH. Spool owns the
 *                            right to look, the check costs nothing, and the
 *                            answer is stable. Known before anyone types.
 *   is it signed in          a fact inside another product. Spool could read
 *                            `~/.claude.json` and `~/.claude/.credentials.json`
 *                            and guess, but that is Spool parsing a private file
 *                            format it does not own and breaking the week it
 *                            changes. So Spool does not look. It asks, by doing
 *                            the thing it was going to do anyway.
 *
 * So the two states are drawn differently on purpose, and the difference is not
 * a stylistic one:
 *
 *   missing    a wall, in the transcript's place, before the first keystroke.
 *              Nothing here can happen, and a composer that accepted a prompt
 *              would be collecting it for nobody.
 *   out        a strip under the tabs, and the moment itself in the log. The
 *              composer stays live, because Spool does not know yet — the send
 *              is how it finds out, and the refusal lands on the beat the first
 *              token would have.
 *
 * **What is not here is the API-key login, and cutting it is a decision.** The
 * preflight `BuilderIO/agent-native` runs can tell a subscription login from an
 * API-key one, and the map's bar reads *keys: none, ever*. That bar is a promise
 * about what Spool asks for and stores, and spawning a binary that is configured
 * with a key breaks none of it: Spool asks for nothing, stores nothing, and the
 * key is never in the path. A warning there would be Spool holding an opinion
 * about someone's billing arrangement. It is their login.
 */

/** what a spawn would find, right now */
export type Preflight = "missing" | "out" | "ready";

/**
 * The binary's own words, quoted rather than written.
 *
 * The same law the todos, the model menu and the usage windows are under: the
 * thing that knows supplies the phrasing, and the rail never invents a friendlier
 * one. `Not logged in` and `Please run /login` are both verbatim strings in the
 * installed 2.1.220, alongside `Invalid API key`, `No authentication available`
 * and the longer `Please run /login and sign in with your Claude.ai account (not
 * Console).`
 */
export const NOT_LOGGED_IN = "Not logged in";

/**
 * The one line Spool writes for itself, and the reason it has to.
 *
 * `/login` is a slash command inside the interactive TUI. Spool spawns `-p`,
 * where there is no session to type it into, so quoting the binary's remedy
 * verbatim would be quoting an instruction that cannot be followed from here.
 * The translation is the whole of Spool's addition: name the terminal, then hand
 * back the binary's own command.
 */
export const LOGIN_REMEDY = "run `claude` in a terminal, then /login";

/**
 * The map's bar, said out loud, in the one place on this page it belongs.
 *
 * Somebody looking at a signed-out agent is exactly the person about to go
 * hunting for a field to paste a key into. It rides under the remedy rather than
 * in the standing strip, because at 420px the strip has room for the fact and the
 * button and nothing between them — and because this is a sentence you need once,
 * at the moment you are deciding what to do, not for as long as the state lasts.
 */
export const NO_KEY = "spool uses that login; it never asks for a key";

/** the binary's own docs root, as it links it itself */
export const DOCS = "code.claude.com/docs";

/**
 * Whose login it turns out to be.
 *
 * Not decoration. The preflight the check runs comes back with an account on it —
 * `oauthAccount` carries `emailAddress`, `displayName` and `organizationName` —
 * and saying which one closes the loop the wall opened. It is also the honest
 * version of the API-key question this ticket cut: Spool does not judge the
 * login, it names it, once, at the moment it starts using it.
 */
export const ACCOUNT = "ada@kaffe.se";

/** how long a check takes to come back, which is a process starting, not a request */
const CHECK_MS = 620;

/** the measured median ttft across the parent capture, so a refusal lands where a reply would */
const ASK_MS = 1569;

export interface LoginDeck {
	readonly state: Preflight;
	/** true while the check is out */
	readonly checking: boolean;
	/** what the log has to show above the turn: the send that bounced, and why */
	readonly notes: readonly PlayEntry[];
	/**
	 * This run's prompt is already in the log above, so the turn must not draw its
	 * own copy of it. True only for the run the held prompt started: a later send
	 * is the human speaking again, and that one is the turn's to render.
	 */
	readonly carried: boolean;
	/** true when the send went nowhere, so the caller must not start a turn */
	readonly say: (text: string) => boolean;
	/** ask again; on success the held prompt goes where it was always going */
	readonly check: () => void;
}

/**
 * Logged out, found out the only honest way, and what happens to the prompt.
 *
 * A send is not thrown away. It goes into the log in the human's own voice the
 * instant they press Enter, because they said it, and it stays there while they
 * go and sign in somewhere else. When the check passes, that same prompt is the
 * one that runs — nobody retypes a sentence to prove they meant it.
 *
 * The beat before the refusal is not a stall. Nothing local knows the login is
 * bad; the spawn is the question, and the answer arrives when the first token
 * would have. A composer that refused instantly would be Spool guessing, and it
 * would guess wrong the moment someone signs in without telling it.
 */
export function useLogin(send: (text: string) => void, run: number): LoginDeck {
	const [state, setState] = useState<Preflight>("out");
	const [checking, setChecking] = useState(false);
	const [notes, setNotes] = useState<readonly PlayEntry[]>([]);
	const [held, setHeld] = useState<string | null>(null);
	const [heldRun, setHeldRun] = useState<number | null>(null);

	const say = useCallback(
		(text: string): boolean => {
			if (state === "ready") return false;
			setHeld(text);
			setNotes((prev) => [...prev, { key: `out-said-${prev.length}`, kind: "user", text }]);
			window.setTimeout(() => {
				setNotes((prev) => [
					...prev,
					{ key: `out-why-${prev.length}`, kind: "note", text: NOT_LOGGED_IN, rule: true },
					// the remedy and its reassurance are one thing to read, so they are
					// one entry: the note's own two weights rather than two entries a
					// turn's gap apart
					{ key: `out-fix-${prev.length}`, kind: "note", said: LOGIN_REMEDY, text: NO_KEY },
				]);
			}, ASK_MS);
			return true;
		},
		[state],
	);

	const check = useCallback(() => {
		if (checking || state === "ready") return;
		setChecking(true);
		window.setTimeout(() => {
			setChecking(false);
			setState("ready");
			setNotes((prev) => [
				...prev,
				{ key: `out-in-${prev.length}`, kind: "note", text: `signed in as ${ACCOUNT}`, rule: true },
			]);
			if (held === null) return;
			setHeldRun(run + 1);
			send(held);
		}, CHECK_MS);
	}, [checking, state, held, run, send]);

	return { state, checking, notes, carried: heldRun !== null && heldRun === run, say, check };
}

/**
 * The check behind the wall, which is allowed to keep failing.
 *
 * Installing an agent takes minutes, not the second a login takes, so this one is
 * not a door that opens on the second knock. It goes out, comes back with the
 * same answer, and says so in one quiet line — which is the honest outcome and
 * also the only way the button proves it did anything at all.
 */
export function useLook(): { checking: boolean; looked: boolean; look: () => void } {
	const [checking, setChecking] = useState(false);
	const [looked, setLooked] = useState(false);

	const look = useCallback(() => {
		if (checking) return;
		setChecking(true);
		window.setTimeout(() => {
			setChecking(false);
			setLooked(true);
		}, CHECK_MS);
	}, [checking]);

	return { checking, looked, look };
}
