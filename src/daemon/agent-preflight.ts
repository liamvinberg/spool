import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { type AgentExecutor, probeAgent } from "./agent-exec";
import { AGENT_COMMAND, type AgentSpawn } from "./agent-spawn";

/**
 * The two ways there is no agent to talk to (#127, #201).
 *
 * Both are ordinary states of the rail rather than error paths, because spool spawns
 * the developer's own binary and reuses whatever login is already there. They are two
 * questions rather than one, and they are answered differently because they are not
 * knowable in the same way:
 *
 *   is there a command    a fact about this machine's PATH. Spool owns the right to
 *                         look, the check costs nothing, and the answer is stable — so
 *                         it is known before anyone types, and a missing binary is a
 *                         wall in the transcript's place.
 *   is it signed in       a fact inside another product. Spool does not read
 *                         `~/.claude.json` or the credentials beside it: that is spool
 *                         parsing a private file format it does not own and breaking
 *                         the week it changes. It asks the binary, and the binary
 *                         answers with a who.
 *
 * Nothing here is asked on a clock. The PATH check runs when the rail opens and when a
 * hand presses `check again`; the login is asked only on that press. A send is never
 * gated on either, because the spawn is the question: a composer that refused instantly
 * would be spool answering on the agent's behalf, and it would answer wrong the first
 * morning somebody signs in without telling it.
 */

/** whether a candidate path is something this machine would run */
export type Look = (path: string) => boolean;

const runnable: Look = (path) => {
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
};

/**
 * The names a bare command may wear.
 *
 * One on a Unix machine, where the executable bit is the whole of the question. Several
 * on Windows, where a name on PATH is only a name and `PATHEXT` is what says which
 * suffixes are runnable — a check that looked for an extensionless `claude` there would
 * report an agent as missing on a machine that has one, which is the one answer this
 * must never invent.
 */
function candidates(env: Readonly<Record<string, string | undefined>>): readonly string[] {
	if (process.platform !== "win32") return [AGENT_COMMAND];
	const exts = (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
		.split(";")
		.map((ext) => ext.trim())
		.filter((ext) => ext !== "");
	return [AGENT_COMMAND, ...exts.map((ext) => `${AGENT_COMMAND}${ext.toLowerCase()}`)];
}

/**
 * Is the agent on this machine: a `which`, and nothing more than a `which`.
 *
 * It resolves the same bare name a spawn would, off the same environment a spawn would
 * inherit, so the two cannot disagree about what `claude` means here. It runs nothing:
 * asking the binary to say hello would cost a process on every rail that opens, and
 * being on PATH is the whole of what is being claimed.
 *
 * `look` is a seam for the same reason the executor is one — a test says what this
 * machine has rather than depending on what the machine running it happens to have.
 */
export function agentInstalled(env: Readonly<Record<string, string | undefined>>, look: Look = runnable): boolean {
	const names = candidates(env);
	for (const dir of (env.PATH ?? "").split(delimiter)) {
		// an empty entry means the working directory to a shell, and spool is not a shell:
		// resolving a bare command name against the project root would make a `claude` file
		// somebody committed into a repo the thing spool spawns
		if (dir === "") continue;
		for (const name of names) if (look(join(dir, name))) return true;
	}
	return false;
}

/**
 * Whose login the binary reports, in the binary's own words.
 *
 * `signedIn` is the binary's own `loggedIn` and never spool's inference from anything
 * else. `account` is the who on the reply, which is what closes the loop a bounce
 * opened: spool does not judge a login, it names it, once, at the moment it starts
 * using it. Null where the reply named nobody — a name spool invented would be worse
 * than no name at all.
 */
export interface AgentLogin {
	readonly signedIn: boolean;
	readonly account: string | null;
}

/** nobody, and no reason to claim otherwise: what a probe that could not ask answers */
const NOBODY: AgentLogin = { signedIn: false, account: null };

/**
 * The one command spool asks the login question with.
 *
 * `claude auth status --json` is the binary reporting on itself, which is the whole
 * point: the alternative is reading `~/.claude.json` for its `oauthAccount`, and that
 * is a private format spool does not own. It is not a turn — no session, no prompt, no
 * model, no token — so it neither joins a conversation nor spends anything, and it
 * takes 0.31s measured on 2.1.220.
 */
export function planAgentLogin(root: string, env: Readonly<Record<string, string | undefined>>): AgentSpawn {
	return { command: AGENT_COMMAND, args: ["auth", "status", "--json"], cwd: root, env: { ...env } };
}

/**
 * The reply, read the way every other adapter here reads one: tolerantly.
 *
 * A shape that changed costs the account its name, never the rail its render. `loggedIn`
 * has to be there and has to be `true`, because *signed in* is the claim that lets a
 * held prompt run, and inferring it from the presence of an email would be spool
 * deciding something the binary declined to say.
 */
export function loginOf(reply: string): AgentLogin {
	let wire: unknown;
	try {
		wire = JSON.parse(reply);
	} catch {
		return NOBODY;
	}
	if (typeof wire !== "object" || wire === null) return NOBODY;
	const status = wire as { loggedIn?: unknown; email?: unknown };
	// a who with no login behind it is nobody: the name exists to be said at the moment
	// spool starts using the login, and there is no such moment here
	if (status.loggedIn !== true) return NOBODY;
	return { signedIn: true, account: typeof status.email === "string" && status.email !== "" ? status.email : null };
}

export interface AgentLoginOptions {
	readonly executor: AgentExecutor;
	readonly root: string;
	readonly env: Readonly<Record<string, string | undefined>>;
	/** how long the binary gets to answer before the probe gives up on it */
	readonly timeoutMs?: number;
	/** the request that asked, so a page that navigated off takes the process with it */
	readonly signal?: AbortSignal;
}

/** a local read of a local file by the process that owns it; nothing here is a request */
const LOGIN_TIMEOUT_MS = 10_000;

/**
 * Ask the binary whose login it is (#201).
 *
 * Asked only when a hand presses `check again`. Never at boot, never on a clock, and
 * never before a send: what a send finds out is found out by sending, and this exists
 * so that the recovery — go and sign in somewhere else, come back, press once — has
 * something to press that answers with a name rather than with a second bounce.
 *
 * The executor is the turn's own seam, so CI never spawns an agent for this either. The
 * reply is JSON over several lines, so the lines are joined back into the document the
 * binary printed rather than read one at a time.
 */
export async function askAgentLogin({
	executor,
	root,
	env,
	timeoutMs = LOGIN_TIMEOUT_MS,
	signal,
}: AgentLoginOptions): Promise<AgentLogin> {
	let proc: Awaited<ReturnType<AgentExecutor>>;
	try {
		proc = await executor(planAgentLogin(root, env));
	} catch {
		// there is nothing to ask, which is the other state entirely: the wall is already
		// up and the strip is not what this machine needs
		return NOBODY;
	}
	const said: string[] = [];
	await probeAgent(
		proc,
		timeoutMs,
		() => {
			proc.onLine((line) => said.push(line));
			// it is asked nothing at all, so closing its input is what lets it get on with
			// answering — and it is over when it exits, which is why nothing finishes early here
			proc.end();
		},
		signal,
	);
	return loginOf(said.join("\n"));
}
