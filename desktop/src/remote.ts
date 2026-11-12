import { spawn as spawnProcess, spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Another machine's daemon, reached through an SSH local forward.
//
// The daemon binds loopback on purpose, and the frames it serves live on
// run.spool.localhost, capture-spool.localhost and room-spool.localhost, which
// only resolve to loopback. So the window has to see the remote daemon at 127.0.0.1, and on the
// same port number it listens on there: the daemon checks Origin against its own
// port, so a write through 127.0.0.1:9000 to a daemon on 7768 is refused.
// `ssh -L 127.0.0.1:P:127.0.0.1:P` is the one way in that keeps all of that.
//
// Hidden unless someone writes remote.json by hand into the state directory.
// The app never writes it.

export interface RemoteConfig {
	/** An ssh destination: `user@host`, `host`, or a Host alias from ~/.ssh/config. */
	ssh: string;
	/** The daemon's port on the remote machine, and so the forward's port on this one. */
	port: number;
	/** What the menu and the window call the remote machine. */
	name: string;
}

export const REMOTE_FILE = "remote.json";

/**
 * remote.json, read. Absent is no remote and no error: the feature does not
 * exist. Present but wrong is no remote and an error saying why, for the log.
 */
export function readRemote(directory: string): { config?: RemoteConfig; error?: string } {
	let raw: string;
	try {
		raw = readFileSync(join(directory, REMOTE_FILE), "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		return { error: `${REMOTE_FILE} could not be read: ${(error as Error).message}` };
	}
	return parseRemote(raw);
}

export function parseRemote(raw: string): { config?: RemoteConfig; error?: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { error: `${REMOTE_FILE} is not JSON` };
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
		return { error: `${REMOTE_FILE} is not an object` };
	const { ssh, port, name } = parsed as Record<string, unknown>;
	// a destination starting with "-" would be read by ssh as an option
	if (typeof ssh !== "string" || ssh === "" || ssh.startsWith("-") || /\s/.test(ssh))
		return { error: `${REMOTE_FILE} needs "ssh": an ssh destination such as user@host` };
	if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535)
		return { error: `${REMOTE_FILE} needs "port": the remote daemon's port, such as 7768` };
	if (name !== undefined && (typeof name !== "string" || name.trim() === ""))
		return { error: `${REMOTE_FILE} has a "name" that is not a word` };
	return { config: { ssh, port, name: typeof name === "string" ? name.trim() : hostName(ssh) } };
}

/** `liam@devobee.example.net` is called devobee; an address stays an address. */
function hostName(destination: string): string {
	const host = destination
		.replace(/^ssh:\/\//, "")
		.split("@")
		.at(-1)
		?.replace(/:\d+$/, "");
	if (host === undefined || host === "") return destination;
	if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return host;
	return host.split(".")[0] || host;
}

/** Whether the window is on the remote, which survives a relaunch. Never remote.json. */
const CHOICE_FILE = "remote-connect.json";

export function readRemoteChoice(directory: string): boolean {
	try {
		return (
			(JSON.parse(readFileSync(join(directory, CHOICE_FILE), "utf8")) as { connected?: unknown }).connected === true
		);
	} catch {
		return false;
	}
}

export function writeRemoteChoice(directory: string, connected: boolean): void {
	try {
		writeFileSync(join(directory, CHOICE_FILE), `${JSON.stringify({ connected })}\n`);
	} catch {
		// an unwritable state directory forgets the choice, which is all it costs
	}
}

export function sshArgs(config: Pick<RemoteConfig, "ssh" | "port">): string[] {
	const forward = forwardSpec(config.port);
	return [
		"-N",
		"-o",
		"BatchMode=yes",
		// not yes: a RemoteForward in ~/.ssh/config that the far end already holds would end the tunnel
		// too, and ClearAllForwardings clears this -L with it, so the local bind failing is read off stderr
		"-o",
		"ExitOnForwardFailure=no",
		"-o",
		"ServerAliveInterval=15",
		"-o",
		"ServerAliveCountMax=2",
		"-o",
		"ConnectTimeout=10",
		"-L",
		forward,
		"--",
		config.ssh,
	];
}

const LOCAL_BIND_FAILED = /could not request local forwarding/i;

function forwardSpec(port: number): string {
	return `127.0.0.1:${port}:127.0.0.1:${port}`;
}

/**
 * What ssh said, as a sentence about the machine. ssh's stderr is the only
 * place the reason lives; a reason nobody recognises is ssh's own last line.
 */
export function failureReason(stderr: string, config: Pick<RemoteConfig, "ssh" | "port" | "name">): string {
	const lines = stderr
		.split("\n")
		.map((line) => line.trim())
		// a RemoteForward from ~/.ssh/config the far end refused is not why the tunnel stopped
		.filter((line) => line !== "" && !/^warning: remote port forwarding failed/i.test(line));
	// a refused channel ("channel 2: open failed: connect failed: Connection refused") is the far end's
	// port, said by a tunnel that is up; everything else is about reaching the machine at all
	const channel = (line: string) => /open failed|connect failed/i.test(line);
	const own = lines.filter((line) => !channel(line)).join("\n");
	if (/address already in use|cannot listen to port|could not request local forwarding/i.test(own))
		return `port ${config.port} is already in use on this Mac`;
	if (/host key verification failed|remote host identification has changed/i.test(own))
		return `its host key is not trusted yet. Run ssh ${config.ssh} once in Terminal`;
	if (/permission denied/i.test(own)) return `ssh was refused. Check that ssh ${config.ssh} works in Terminal`;
	if (
		/could not resolve hostname|timed out|no route to host|connection refused|network is unreachable|host is down|connection closed|connection reset|broken pipe/i.test(
			own,
		)
	)
		return `${config.name} is not answering`;
	if (lines.some(channel)) return `no spool daemon is running on port ${config.port} there`;
	return lines.at(-1) ?? "ssh stopped";
}

export type TunnelStatus = { state: "connecting" } | { state: "connected" } | { state: "failed"; reason: string };

/** What the tunnel needs of a child process: enough to read why it died and to kill it. "close" rather than "exit", so stderr has all been read. */
export interface TunnelChild {
	pid?: number | undefined;
	stderr: { on(event: "data", listener: (chunk: Buffer | string) => void): unknown } | null;
	once(event: "close", listener: (code: number | null) => void): unknown;
	once(event: "error", listener: (error: Error) => void): unknown;
	kill(signal?: NodeJS.Signals): boolean;
}

export interface TunnelClock {
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimeout(handle: unknown): void;
}

export interface TunnelOptions {
	spawn?: (command: string, args: string[]) => TunnelChild;
	clock?: TunnelClock;
	/** Whether a spool daemon answers /api/health on 127.0.0.1:port. */
	health?: (port: number) => Promise<boolean>;
	onStatus?: (status: TunnelStatus) => void;
	/** Where the running ssh's pid is kept, so a crashed app's ssh is ended on the next launch. */
	pidFile?: string;
	log?: (...fields: string[]) => void;
}

export const SSH = "/usr/bin/ssh";
export const FIRST_RETRY_MS = 1_000;
export const LAST_RETRY_MS = 30_000;
/** How often health is asked while the forward comes up, and how long that may take. */
export const READY_STEP_MS = 500;
export const READY_PATIENCE_MS = 15_000;
/** How often a connected tunnel checks the daemon behind it is still there. */
export const WATCH_MS = 5_000;

export async function spoolAnswers(port: number, timeoutMs = 1_500): Promise<boolean> {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
		if (!response.ok) return false;
		const body = (await response.json()) as { name?: unknown };
		return body.name === "spool";
	} catch {
		return false;
	}
}

const realClock: TunnelClock = {
	setTimeout: (callback, ms) => setTimeout(callback, ms).unref(),
	clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/**
 * One ssh forward, kept up. ssh is started, health is asked through it until
 * spool answers, and then asked every few seconds so a daemon that went away
 * behind a live tunnel is said too. ssh exiting starts it again after a wait
 * that doubles from a second to half a minute, and goes back to a second once a
 * connection has answered. `restart` skips the wait: after sleep a tunnel is
 * dead whatever ssh thinks, and waiting out ServerAlive is 30 seconds of a
 * canvas that does not save.
 */
export class Tunnel {
	private child: TunnelChild | undefined;
	private stderr = "";
	private timer: unknown;
	private retryMs = FIRST_RETRY_MS;
	private running = false;
	private generation = 0;
	private current: TunnelStatus = { state: "connecting" };
	private readonly spawn: (command: string, args: string[]) => TunnelChild;
	private readonly clock: TunnelClock;
	private readonly health: (port: number) => Promise<boolean>;

	constructor(
		readonly config: RemoteConfig,
		private readonly options: TunnelOptions = {},
	) {
		this.spawn =
			options.spawn ?? ((command, args) => spawnProcess(command, args, { stdio: ["ignore", "ignore", "pipe"] }));
		this.clock = options.clock ?? realClock;
		this.health = options.health ?? ((port) => spoolAnswers(port));
	}

	get status(): TunnelStatus {
		return this.current;
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.connect();
	}

	/** Drop the ssh there is and start another now, with the wait back at its shortest. */
	restart(): void {
		if (!this.running) return;
		this.retryMs = FIRST_RETRY_MS;
		this.end();
		this.connect();
	}

	stop(): void {
		this.running = false;
		this.end();
	}

	private end(): void {
		this.generation++;
		if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
		this.timer = undefined;
		const child = this.child;
		this.child = undefined;
		if (child !== undefined) {
			child.kill("SIGTERM");
			this.forgetPid();
		}
	}

	private connect(): void {
		const generation = ++this.generation;
		this.stderr = "";
		this.say({ state: "connecting" });
		let child: TunnelChild;
		try {
			child = this.spawn(SSH, sshArgs(this.config));
		} catch (error) {
			this.exited(generation, `ssh could not start: ${(error as Error).message}`);
			return;
		}
		this.child = child;
		this.rememberPid(child.pid);
		this.options.log?.("remote", "ssh", `pid=${child.pid ?? "?"}`, this.config.name, `port=${this.config.port}`);
		child.stderr?.on("data", (chunk) => {
			this.stderr = `${this.stderr}${chunk.toString()}`.slice(-4_000);
			// a forward that could not bind leaves ssh up with the port answering for whoever holds it
			if (generation === this.generation && LOCAL_BIND_FAILED.test(this.stderr)) child.kill("SIGTERM");
		});
		child.once("error", (error) => this.exited(generation, `ssh could not start: ${error.message}`));
		child.once("close", (code) =>
			this.exited(generation, this.stderr.trim() === "" ? `ssh stopped (exit ${code ?? "signal"})` : undefined),
		);
		const startedAt = { elapsed: 0 };
		const ready = () => {
			void this.health(this.config.port).then((answers) => {
				if (generation !== this.generation) return;
				if (answers) {
					this.retryMs = FIRST_RETRY_MS;
					this.say({ state: "connected" });
					this.timer = this.clock.setTimeout(watch, WATCH_MS);
					return;
				}
				startedAt.elapsed += READY_STEP_MS;
				if (startedAt.elapsed >= READY_PATIENCE_MS && this.current.state === "connecting")
					this.say({ state: "failed", reason: this.noDaemon() });
				this.timer = this.clock.setTimeout(ready, this.current.state === "connecting" ? READY_STEP_MS : WATCH_MS);
			});
		};
		const watch = () => {
			void this.health(this.config.port).then((answers) => {
				if (generation !== this.generation) return;
				if (answers) this.say({ state: "connected" });
				else this.say({ state: "failed", reason: this.noDaemon() });
				this.timer = this.clock.setTimeout(watch, WATCH_MS);
			});
		};
		this.timer = this.clock.setTimeout(ready, READY_STEP_MS);
	}

	private noDaemon(): string {
		return /connect failed|open failed/i.test(this.stderr)
			? failureReason(this.stderr, this.config)
			: `nothing answers on port ${this.config.port} there`;
	}

	private exited(generation: number, plain: string | undefined): void {
		if (generation !== this.generation) return;
		this.generation++;
		if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
		this.child = undefined;
		this.forgetPid();
		const reason = plain ?? failureReason(this.stderr, this.config);
		this.options.log?.("remote", "ssh exited", reason, `retry=${this.retryMs}ms`);
		this.say({ state: "failed", reason });
		if (!this.running) return;
		const wait = this.retryMs;
		this.retryMs = Math.min(this.retryMs * 2, LAST_RETRY_MS);
		this.timer = this.clock.setTimeout(() => {
			this.timer = undefined;
			if (this.running) this.connect();
		}, wait);
	}

	private say(next: TunnelStatus): void {
		if (JSON.stringify(next) === JSON.stringify(this.current)) return;
		this.current = next;
		this.options.onStatus?.(next);
	}

	private rememberPid(pid: number | undefined): void {
		if (this.options.pidFile === undefined || pid === undefined) return;
		try {
			writeFileSync(this.options.pidFile, `${pid}\n`);
		} catch {
			// the crash case then leaves an ssh behind until it is ended by hand
		}
	}

	private forgetPid(): void {
		if (this.options.pidFile !== undefined) rmSync(this.options.pidFile, { force: true });
	}
}

/**
 * End the ssh a crashed app left behind, if it is still running: it holds the
 * port the next tunnel needs. Only a process that is still our ssh forward is
 * killed, so a pid the system has since reused for something else is left alone.
 */
export function reclaimTunnel(
	pidFile: string,
	port: number,
	command: (pid: number) => string | undefined = processCommand,
	kill: (pid: number) => void = (pid) => process.kill(pid, "SIGTERM"),
): number | undefined {
	let pid: number;
	try {
		pid = Number.parseInt(readFileSync(pidFile, "utf8"), 10);
	} catch {
		return undefined;
	}
	rmSync(pidFile, { force: true });
	if (!Number.isInteger(pid) || pid <= 0) return undefined;
	const running = command(pid);
	if (running === undefined || !running.includes("ssh") || !running.includes(forwardSpec(port))) return undefined;
	try {
		kill(pid);
	} catch {
		return undefined;
	}
	return pid;
}

function processCommand(pid: number): string | undefined {
	const result = spawnSync("/bin/ps", ["-o", "command=", "-p", String(pid)], { encoding: "utf8" });
	return result.status === 0 ? result.stdout.trim() : undefined;
}
