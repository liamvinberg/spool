import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join, posix, win32 } from "node:path";
import { withPathFirst } from "./agent-cli";
import { AGENT_ENGINE_IDS, type AgentEngine, type AgentEngineId } from "./agent-engine";
import { agentPath } from "./agent-preflight";
import { checkProviderKey, literalKeyRefusal, readPiAuth, withPiAuthLock, writePiAuth } from "./pi-auth";

/**
 * Putting an agent on this machine from spool's first run (spool#250): install it with its
 * vendor's own installer, start its own sign-in, and say where each one stands.
 *
 * Everything here is the machine's, never a project's: the first run has no project open,
 * and an agent installed or signed in is so for every project at once. Spool still owns no
 * login. A sign-in is the agent's own command, which opens the browser itself and writes
 * its own credentials; spool only starts it and asks the agent again once it ends.
 *
 * Where a step can't run unattended (no npm for pi, no curl, a sign-in that only happens
 * inside the agent) the plan has no command and the row shows the line to copy instead.
 */

/** One command spool runs, and the line a person would type for it. */
export interface SetupCommand {
	readonly command: string;
	readonly args: readonly string[];
	/** what it adds to the environment, beside the daemon's own */
	readonly env?: Readonly<Record<string, string>>;
}

export interface AgentSetupPlan {
	/** the installer spool runs; null where it can't run here */
	readonly install: SetupCommand | null;
	/** the install as a person types it, always said */
	readonly installLine: string;
	/** the agent's own sign-in, which opens the browser; null where it only happens inside the agent */
	readonly signIn: SetupCommand | null;
	readonly signInLine: string;
	/** where the installer puts the binary, which a GUI-launched daemon's PATH may not hold yet */
	readonly bin?: string;
}

export type AgentSetupPlans = Readonly<Record<AgentEngineId, AgentSetupPlan>>;

/** The machine an install is planned for: its platform, home, environment, and whether a command is on it. */
export interface SetupMachine {
	readonly platform: NodeJS.Platform;
	readonly home: string;
	readonly env?: Readonly<Record<string, string | undefined>>;
	readonly has: (command: string) => boolean;
}

const PI_PACKAGE = "@earendil-works/pi-coding-agent";

/**
 * The official installers as their vendors document them (checked for spool#250): Claude
 * Code's native installer and Codex's standalone one need no Node; pi is an npm package.
 * Where each puts its binary, which a daemon started before it may not have on PATH:
 * Claude Code in `~/.local/bin` (`%USERPROFILE%\.local\bin` on Windows); Codex in
 * `~/.local/bin`, and on Windows in `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin`, either
 * moved by `CODEX_INSTALL_DIR`; pi wherever npm puts global commands, beside npm itself
 * on a Mac or Linux and `%APPDATA%\npm` on Windows, as a `pi.cmd`. Codex's installer asks
 * whether to start Codex at the end, which `CODEX_NON_INTERACTIVE` answers.
 */
export function agentSetupPlans({ platform, home, env = {}, has }: SetupMachine): AgentSetupPlans {
	const windows = platform === "win32";
	const path = windows ? win32 : posix;
	const localBin = path.join(home, ".local", "bin");
	const set = (name: string) => (env[name]?.trim() ? env[name]?.trim() : undefined);
	const codexBin =
		set("CODEX_INSTALL_DIR") ??
		(windows
			? path.join(set("LOCALAPPDATA") ?? path.join(home, "AppData", "Local"), "Programs", "OpenAI", "Codex", "bin")
			: localBin);
	const powershell = (script: string): SetupCommand => ({
		command: "powershell",
		args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
	});
	const sh = (shell: "bash" | "sh", url: string): SetupCommand | null =>
		has("curl") && has(shell) ? { command: shell, args: ["-c", `curl -fsSL ${url} | ${shell}`] } : null;
	const claudeScript = "irm https://claude.ai/install.ps1 | iex";
	const codexScript = "irm https://chatgpt.com/codex/install.ps1 | iex";
	const npm = windows ? "npm.cmd" : "npm";
	return {
		claude: {
			install: windows ? powershell(claudeScript) : sh("bash", "https://claude.ai/install.sh"),
			installLine: windows ? claudeScript : "curl -fsSL https://claude.ai/install.sh | bash",
			signIn: { command: "claude", args: ["auth", "login"] },
			signInLine: "claude auth login",
			bin: localBin,
		},
		codex: {
			install: (() => {
				const plan = windows ? powershell(codexScript) : sh("sh", "https://chatgpt.com/codex/install.sh");
				return plan && { ...plan, env: { CODEX_NON_INTERACTIVE: "1" } };
			})(),
			installLine: windows
				? `powershell -ExecutionPolicy ByPass -c "${codexScript}"`
				: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
			signIn: { command: "codex", args: ["login"] },
			signInLine: "codex login",
			bin: codexBin,
		},
		pi: {
			install: has(npm) ? { command: npm, args: ["install", "-g", PI_PACKAGE] } : null,
			installLine: `npm install -g ${PI_PACKAGE}`,
			// pi signs in with a plan only from inside its own session
			signIn: null,
			signInLine: "pi, then type /login",
			...(windows ? { bin: path.join(set("APPDATA") ?? path.join(home, "AppData", "Roaming"), "npm") } : {}),
		},
	};
}

/** What is running for an agent now, or what the last run left to say. */
export type SetupJob =
	| {
			readonly kind: "install";
			readonly state: "running" | "failed";
			/** the installer's last lines, newest last */
			readonly lines: readonly string[];
	  }
	| {
			readonly kind: "sign-in";
			readonly state: "running" | "failed";
			readonly lines: readonly string[];
			/** the page the agent opened, for when the browser didn't come up */
			readonly url: string | null;
			/** the agent printed that it takes a pasted code */
			readonly asksCode: boolean;
	  };

/** One agent as the first run's row draws it. */
export interface MachineAgent {
	readonly id: AgentEngineId;
	readonly installed: boolean;
	/** on this machine but older than spool runs */
	readonly outdated: boolean;
	readonly signedIn: boolean;
	/** who it is signed in as, in the agent's own words; null where it named nobody */
	readonly account: string | null;
	/** the install, typed; `unattended` when spool can run it from here */
	readonly install: { readonly line: string; readonly unattended: boolean };
	readonly signIn: { readonly line: string; readonly unattended: boolean };
	readonly job: SetupJob | null;
}

/** A provider pi takes a pasted key for, by pi's own id. */
export const PI_KEY_PROVIDERS = [
	{ id: "anthropic", name: "Anthropic" },
	{ id: "openai", name: "OpenAI" },
	{ id: "google", name: "Google Gemini" },
	{ id: "openrouter", name: "OpenRouter" },
	{ id: "deepseek", name: "DeepSeek" },
	{ id: "xai", name: "xAI" },
	{ id: "mistral", name: "Mistral" },
	{ id: "groq", name: "Groq" },
	{ id: "kimi-coding", name: "Kimi" },
	{ id: "minimax", name: "MiniMax" },
	{ id: "zai", name: "Z.ai" },
] as const;
export type PiKeyProvider = (typeof PI_KEY_PROVIDERS)[number]["id"];

export function isPiKeyProvider(value: unknown): value is PiKeyProvider {
	return PI_KEY_PROVIDERS.some((provider) => provider.id === value);
}

export type PiKeyResult =
	| {
			readonly ok: true;
			/** the provider's models pi now offers; 0 where pi couldn't say */
			readonly models: number;
			/** the provider took the key; false when spool couldn't ask it and saved it as it was told */
			readonly checked: boolean;
			/** it took the place of a key or sign-in pi already had for the provider */
			readonly replaced: boolean;
	  }
	| {
			readonly ok: false;
			readonly reason: string;
			/** spool couldn't ask the provider, and saving it would replace what pi has: it may be saved unchecked */
			readonly unchecked?: true;
	  };

/** A running setup command: its lines, its input, its end. */
export interface SetupProcess {
	onLine(listener: (line: string) => void): void;
	write(text: string): void;
	/** stop it and everything it started, resolving once they have all gone */
	kill(): Promise<void>;
	/** its exit code, null when it never started or died on a signal */
	readonly exited: Promise<number | null>;
}

export type SetupRunner = (command: SetupCommand, env: Readonly<Record<string, string | undefined>>) => SetupProcess;

/** Escapes a terminal reads and a row does not: colours, cursor moves, OSC 8 links. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the escapes are the point
const ESCAPES = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-_]/g;

export function plainLine(line: string): string {
	return line.replace(ESCAPES, "").replace(/\r/g, "").trimEnd();
}

const PROMPT = /[>:?]\s*$/;

/** An argument cmd.exe reads as itself: no quotes, spaces, `%`, `^`, `&`, `|`, `<`, `>` or parentheses. */
const CMD_PLAIN = /^[\w@.\\/:=,+-]+$/;

/**
 * How Windows runs a command spool names bare: the file it is on PATH (`npm.cmd`, a
 * `pi.cmd` npm made, `codex.exe`), and a `.cmd` or `.bat` only through cmd.exe, which
 * Node refuses to start one without. cmd.exe reads its line again, so a launcher is run
 * only with arguments it can't read as anything but themselves.
 */
export function windowsLaunch(
	command: SetupCommand,
	/** where the bare name resolves on PATH, PATHEXT applied; undefined where it doesn't */
	resolved: string | undefined,
): { file: string; args: readonly string[]; shell: boolean } | { refused: string } {
	const file = resolved ?? command.command;
	if (!/\.(?:cmd|bat)$/i.test(file)) return { file, args: command.args, shell: false };
	if (!command.args.every((arg) => CMD_PLAIN.test(arg)))
		return { refused: `spool won't pass that to ${command.command} through cmd.exe.` };
	// quoted, as the launcher's own folder may have a space in it (Program Files)
	return { file: `"${file}"`, args: command.args, shell: true };
}

/** A command that never started, saying why. */
function refusedProcess(reason: string): SetupProcess {
	const listeners: ((line: string) => void)[] = [];
	const exited = Promise.resolve().then(() => {
		for (const listener of listeners) listener(reason);
		return null;
	});
	return { onLine: (listener) => listeners.push(listener), write: () => {}, kill: async () => {}, exited };
}

/** how long a stopped command has to end before it is killed outright */
const STOP_GRACE_MS = 3000;
/** how often a stopping process group is asked whether anything in it is left */
const GROUP_POLL_MS = 50;

/** Whether anything is left in a process group, a process not yet reaped included: only ESRCH says none is. */
function groupAlive(pgid: number): boolean {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

/**
 * Every line a command prints, from stdout and stderr alike: an installer's progress goes either way.
 *
 * An installer is never one process (a shell piping curl into another shell, which starts
 * the vendor's own binary), so a stop takes back the whole tree: on POSIX the command
 * leads its own process group and the group is signalled, on Windows `taskkill /T` walks
 * the tree. It counts as ended once every process holding its output has let go; a stop
 * counts as done only once the whole group has gone, as a descendant that let go of the
 * output, or ignores SIGTERM, outlives the command itself.
 */
export const spawnSetup: SetupRunner = (command, env) => {
	const windows = process.platform === "win32";
	const launch = windows
		? windowsLaunch(command, agentPath(env, command.command))
		: { file: command.command, args: command.args, shell: false };
	if ("refused" in launch) return refusedProcess(launch.refused);
	const child = spawn(launch.file, [...launch.args], {
		env: { ...env, ...command.env },
		cwd: homedir(),
		stdio: ["pipe", "pipe", "pipe"],
		shell: launch.shell,
		windowsHide: true,
		detached: !windows,
	});
	const listeners: ((line: string) => void)[] = [];
	const read = (stream: NodeJS.ReadableStream) => {
		let buffer = "";
		stream.setEncoding("utf8");
		stream.on("data", (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split(/\n/);
			buffer = lines.pop() ?? "";
			// a prompt waits on its own line, unended: `Paste code here if prompted > `
			if (PROMPT.test(buffer)) {
				lines.push(buffer);
				buffer = "";
			}
			for (const line of lines) for (const listener of listeners) listener(line);
		});
		stream.on("end", () => {
			if (buffer !== "") for (const listener of listeners) listener(buffer);
			buffer = "";
		});
		stream.on("error", () => {});
	};
	read(child.stdout);
	read(child.stderr);
	child.stdin.on("error", () => {});
	let ended = false;
	const exited = new Promise<number | null>((resolve) => {
		child.on("error", () => resolve(null));
		child.on("close", (code) => resolve(code));
	}).finally(() => {
		ended = true;
	});
	/** Stop the tree and wait it out: SIGTERM to the group, SIGKILL after the grace, until nothing in it is left. */
	const stop = async (): Promise<void> => {
		const pid = child.pid;
		if (pid === undefined) return void (await exited);
		if (windows) {
			if (!ended)
				await new Promise<void>((resolve) => {
					const taskkill = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
						stdio: "ignore",
						windowsHide: true,
					});
					taskkill.on("error", () => {
						child.kill();
						resolve();
					});
					taskkill.on("close", () => resolve());
				});
			return void (await exited);
		}
		const send = (name: NodeJS.Signals) => {
			try {
				process.kill(-pid, name);
			} catch {
				// no group: the child alone, if it is still here
				if (!ended) child.kill(name);
			}
		};
		send("SIGTERM");
		const hardAt = Date.now() + STOP_GRACE_MS;
		while (groupAlive(pid)) {
			if (Date.now() >= hardAt) send("SIGKILL");
			await new Promise((resolve) => setTimeout(resolve, GROUP_POLL_MS));
		}
		await exited;
	};
	let stopping: Promise<void> | undefined;
	return {
		onLine: (listener) => listeners.push(listener),
		write: (text) => child.stdin.write(text),
		kill: () => {
			stopping ??= stop();
			return stopping;
		},
		exited,
	};
};

const KEPT_LINES = 40;
const URL_IN_LINE = /https:\/\/[^\s"'<>]+/;
/** how Claude Code says it takes the code its page shows, when its own callback can't reach it */
const ASKS_CODE = /paste (?:the )?code/i;

export interface AgentSetupDeps {
	readonly engines: ReadonlyMap<AgentEngineId, AgentEngine>;
	readonly plans: AgentSetupPlans;
	/** where an agent's account is asked from: no project, so the home folder */
	readonly home: string;
	/** pi's agent directory, where its `auth.json` lives */
	readonly piDir: string;
	/** how a pasted key is asked of its provider */
	readonly fetch?: typeof fetch;
	readonly run?: SetupRunner;
	/** the environment every setup command runs in, and whose PATH an install adds to */
	readonly env?: Record<string, string | undefined>;
	/** every change, whole, for the pages to draw */
	readonly emit: (agents: readonly MachineAgent[]) => void;
}

interface Known {
	installed: boolean;
	outdated: boolean;
	signedIn: boolean;
	account: string | null;
}

/**
 * What runs for one agent, from its press to its end: an install, the account probe after
 * it, and the sign-in it goes on to. It holds the agent's slot the whole way, and an install
 * holds the machine's one install slot until the installer and everything it started have
 * ended, a stopped one included.
 */
interface SetupRun {
	/** the command running now; null between commands */
	proc: SetupProcess | null;
	/** what that command is */
	step: SetupJob["kind"] | null;
	stopped: boolean;
	/** once stopped, when everything the command started has gone */
	gone: Promise<void> | null;
}

/** The machine's agents and the setup runs on them. */
export function createAgentSetup(deps: AgentSetupDeps) {
	const { engines, plans, home, emit } = deps;
	const run = deps.run ?? spawnSetup;
	const env = deps.env ?? process.env;
	const known = new Map<AgentEngineId, Known>();
	const jobs = new Map<AgentEngineId, SetupJob>();
	const runs = new Map<AgentEngineId, SetupRun>();
	const ids = AGENT_ENGINE_IDS.filter((id) => engines.has(id));

	function snapshot(): MachineAgent[] {
		return ids.map((id) => {
			const plan = plans[id];
			const at = known.get(id) ?? { installed: false, outdated: false, signedIn: false, account: null };
			return {
				id,
				...at,
				install: { line: plan.installLine, unattended: plan.install !== null },
				signIn: { line: plan.signInLine, unattended: plan.signIn !== null },
				job: jobs.get(id) ?? null,
			};
		});
	}
	const changed = () => emit(snapshot());

	/** Ask one agent again: is it here, and who is it signed in as. */
	async function check(id: AgentEngineId, signal?: AbortSignal): Promise<void> {
		const engine = engines.get(id);
		if (engine === undefined) return;
		const installed = engine.installed();
		const outdated = engine.outdated?.() === true;
		const login = installed ? await engine.account(home, signal) : { signedIn: false, account: null };
		known.set(id, { installed, outdated, ...login });
	}

	function setJob(id: AgentEngineId, job: SetupJob | null): void {
		if (job === null) jobs.delete(id);
		else jobs.set(id, job);
		changed();
	}

	/** Still this run's to go on with: not stopped, and nobody else's since. */
	const owns = (id: AgentEngineId, setup: SetupRun) => runs.get(id) === setup && !setup.stopped;

	function end(id: AgentEngineId, setup: SetupRun): void {
		if (runs.get(id) === setup) runs.delete(id);
	}

	/** Run one command for an agent, its lines kept on its job as it goes; its exit code, or undefined once stopped. */
	async function step(
		id: AgentEngineId,
		setup: SetupRun,
		kind: SetupJob["kind"],
		command: SetupCommand,
	): Promise<number | null | undefined> {
		const proc = run(command, env);
		setup.proc = proc;
		setup.step = kind;
		setJob(
			id,
			kind === "install"
				? { kind, state: "running", lines: [] }
				: { kind, state: "running", lines: [], url: null, asksCode: false },
		);
		proc.onLine((raw) => {
			const line = plainLine(raw);
			const job = jobs.get(id);
			if (line === "" || job === undefined || !owns(id, setup) || setup.proc !== proc) return;
			const lines = [...job.lines, line].slice(-KEPT_LINES);
			if (job.kind === "install") return setJob(id, { ...job, lines });
			setJob(id, {
				...job,
				lines,
				url: job.url ?? line.match(URL_IN_LINE)?.[0] ?? null,
				asksCode: job.asksCode || ASKS_CODE.test(line),
			});
		});
		const code = await proc.exited;
		// stopped: its slots are free only once everything it started has gone, not only the command
		if (setup.stopped) await setup.gone;
		setup.proc = null;
		setup.step = null;
		if (!setup.stopped) return code;
		end(id, setup);
		setJob(id, null);
		return undefined;
	}

	/** The installer's bin on the daemon's PATH, so the `which` and the spawns find what it put there. */
	function onPath(dir: string | undefined): void {
		if (dir === undefined || !existsSync(dir)) return;
		if ((env.PATH ?? "").split(delimiter).includes(dir)) return;
		Object.assign(env, withPathFirst(env, dir));
	}

	async function signIn(id: AgentEngineId, setup: SetupRun): Promise<void> {
		const command = plans[id].signIn;
		if (command === null) return end(id, setup);
		const code = await step(id, setup, "sign-in", command);
		if (code === undefined) return;
		await check(id);
		if (!owns(id, setup)) return;
		end(id, setup);
		const job = jobs.get(id);
		if (known.get(id)?.signedIn === true || job === undefined) return setJob(id, null);
		setJob(id, {
			...job,
			state: "failed",
			lines: [...job.lines, code === null ? "The sign-in was stopped." : "The sign-in didn’t finish."],
		});
	}

	async function install(id: AgentEngineId, setup: SetupRun): Promise<void> {
		const plan = plans[id];
		if (plan.install === null) return end(id, setup);
		const code = await step(id, setup, "install", plan.install);
		if (code === undefined) return;
		if (code === 0) onPath(plan.bin);
		await check(id);
		// stopped while the agent was asked: nothing more starts
		if (!owns(id, setup)) return;
		const at = known.get(id);
		const job = jobs.get(id);
		if (at?.installed === true) {
			setJob(id, null);
			// installed and not signed in: its own sign-in comes next, as a person in a terminal would go on
			if (!at.signedIn && plan.signIn !== null) return signIn(id, setup);
			return end(id, setup);
		}
		end(id, setup);
		if (job === undefined) return;
		setJob(id, {
			...job,
			state: "failed",
			lines: [
				...job.lines,
				code === 0
					? "It installed, but spool can’t find it yet. Open a new terminal and try again."
					: "The install didn’t finish.",
			],
		});
	}

	type Refusal = { readonly refused: string; readonly status: 404 | 409 };
	function refuse(id: AgentEngineId, kind: SetupJob["kind"]): Refusal | undefined {
		if (!engines.has(id)) return { refused: `spool doesn't run ${id} here`, status: 404 };
		if (runs.has(id)) return { refused: `${id} is already being set up`, status: 409 };
		const plan = plans[id];
		if ((kind === "install" ? plan.install : plan.signIn) === null)
			return {
				refused: `spool can't run this here: ${kind === "install" ? plan.installLine : plan.signInLine}`,
				status: 409,
			};
		// one install at a time, as two installers writing one PATH profile would fight; a stopped one until it has gone
		if (kind === "install" && [...runs.values()].some((other) => other.step === "install"))
			return { refused: "another agent is installing", status: 409 };
		return undefined;
	}

	function begin(id: AgentEngineId, kind: SetupJob["kind"]): Refusal | undefined {
		const refused = refuse(id, kind);
		if (refused !== undefined) return refused;
		const setup: SetupRun = { proc: null, step: null, stopped: false, gone: null };
		runs.set(id, setup);
		void (kind === "install" ? install(id, setup) : signIn(id, setup));
		return undefined;
	}

	return {
		snapshot,
		/** Every agent asked again, then the snapshot. */
		async read(signal?: AbortSignal): Promise<MachineAgent[]> {
			await Promise.all(ids.map((id) => check(id, signal)));
			return snapshot();
		},
		/** Start the installer; refused while one runs or where it can't run. */
		install: (id: AgentEngineId): Refusal | undefined => begin(id, "install"),
		signIn: (id: AgentEngineId): Refusal | undefined => begin(id, "sign-in"),
		/** The code a sign-in's page showed, handed to the agent that asked for it. */
		code(id: AgentEngineId, code: string): boolean {
			const job = jobs.get(id);
			const setup = runs.get(id);
			if (job?.kind !== "sign-in" || setup?.proc == null || setup.step !== "sign-in" || setup.stopped) return false;
			setup.proc.write(`${code.trim()}\n`);
			return true;
		},
		/**
		 * Stop what runs for an agent, and everything it started, and forget what it said. Its
		 * row says it is stopping until the last of it has gone, and only then is it free again.
		 */
		cancel(id: AgentEngineId): void {
			const setup = runs.get(id);
			if (setup === undefined) {
				setJob(id, null);
				return;
			}
			if (setup.stopped) return;
			setup.stopped = true;
			if (setup.proc === null) {
				// between commands, asking the agent: nothing to wait for
				end(id, setup);
				setJob(id, null);
				return;
			}
			const job = jobs.get(id);
			if (job !== undefined) setJob(id, { ...job, lines: [...job.lines, "Stopping…"].slice(-KEPT_LINES) });
			setup.gone = setup.proc.kill();
		},
		/**
		 * A provider key saved where pi reads it (`auth.json` in its agent directory, the
		 * format pi documents), once its provider has taken it: a typo or a revoked key
		 * leaves pi as it was. Where spool can't reach the provider it saves the key only
		 * when that replaces nothing, or when asked again with `unchecked`, and says so.
		 */
		async piKey(
			provider: PiKeyProvider,
			pasted: string,
			options: { readonly unchecked?: boolean } = {},
		): Promise<PiKeyResult> {
			const key = pasted.trim();
			const refused = literalKeyRefusal(key);
			if (refused !== undefined) return { ok: false, reason: refused };
			const name = PI_KEY_PROVIDERS.find((one) => one.id === provider)?.name ?? provider;
			const said = await checkProviderKey(provider, key, deps.fetch);
			if (said === "refused") return { ok: false, reason: `${name} didn’t take that key.` };
			const file = join(deps.piDir, "auth.json");
			// read again under the lock: another key saved meanwhile, or pi's own sign-in, stays as it is now
			const saved = await withPiAuthLock(file, (): PiKeyResult | { readonly replaced: boolean } => {
				const now = readPiAuth(file);
				if (now.kind === "unreadable") return { ok: false, reason: "pi's auth.json isn't one spool can add to." };
				const replaced = now.entries[provider] !== undefined;
				if (said === "unchecked" && replaced && options.unchecked !== true)
					return {
						ok: false,
						unchecked: true,
						reason: `spool couldn’t reach ${name} to check this key, and pi already has one for ${name}. Save it in its place anyway?`,
					};
				writePiAuth(file, { ...now.entries, [provider]: { type: "api_key", key } });
				return { replaced };
			});
			if (!saved.held) return { ok: false, reason: "pi is busy with its sign-ins. Try again in a moment." };
			if ("ok" in saved.value) return saved.value;
			const { replaced } = saved.value;
			const listed: string[] = [];
			const listing = run({ command: "pi", args: ["--offline", "--list-models"] }, env);
			listing.onLine((line) => listed.push(line));
			await listing.exited;
			await check("pi");
			changed();
			return {
				ok: true,
				models: listed.filter((line) => line.split(/\s+/)[0] === provider).length,
				checked: said === "valid",
				replaced,
			};
		},
	};
}

export type AgentSetup = ReturnType<typeof createAgentSetup>;

/** pi's agent directory, as pi finds it. */
export function piAgentDir(env: Readonly<Record<string, string | undefined>>, home: string): string {
	const set = env.PI_CODING_AGENT_DIR?.trim();
	return set !== undefined && set !== "" ? set : join(home, ".pi", "agent");
}
