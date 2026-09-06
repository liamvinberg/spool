import { type ChildProcess, spawn } from "node:child_process";

export interface CommandStart {
	kind: "start";
	argv: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	timeout: number;
}
export interface CommandResult {
	code: number | null;
	stopped: boolean;
	error?: string;
}

// This owner survives a host SIGKILL. Its private IPC pipe closes when the
// host dies, so no callback in the dying host is needed to retire the group.
let child: ChildProcess | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let stopped = false;
let finished = false;
const kill = () => {
	if (child?.pid === undefined) return;
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		child.kill("SIGKILL");
	}
};
const finish = (code: number | null, error?: string) => {
	if (finished) return;
	finished = true;
	clearTimeout(timer);
	kill();
	const result: CommandResult = { code, stopped, ...(error === undefined ? {} : { error }) };
	if (process.connected)
		process.send?.(result, () => {
			if (process.connected) process.disconnect();
		});
};
const stop = () => {
	stopped = true;
	kill();
	if (child === undefined) finish(null);
};
process.on("disconnect", stop);
process.on("error", stop);
process.stdout.on("error", stop);
process.stderr.on("error", stop);
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
process.on("message", (message: CommandStart | { kind: "stop" }) => {
	if (message.kind === "stop") {
		stop();
		return;
	}
	if (child !== undefined || stopped || finished || !process.connected) return;
	const executable = message.argv[0];
	if (!executable) {
		finish(null, "No command to execute");
		return;
	}
	let error: string | undefined;
	try {
		child = spawn(executable, message.argv.slice(1), {
			cwd: message.cwd,
			env: message.env,
			detached: true,
			stdio: ["ignore", "inherit", "inherit"],
		});
	} catch (cause) {
		finish(null, cause instanceof Error ? cause.message : "Could not start command");
		return;
	}
	timer = setTimeout(stop, message.timeout * 1000);
	child.on("error", (cause) => {
		error = cause.message;
		kill();
	});
	child.on("exit", kill);
	child.on("close", (code) => finish(code, error));
});
if (!process.connected) stop();
