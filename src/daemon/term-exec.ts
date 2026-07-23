import { spawn } from "node:child_process";
import { createWireDecoder, encodeControl, encodeData, WIRE_DATA } from "../term/wire";
import type { Toolchain } from "./term-toolchain";

/**
 * The executor seam (#42): the session manager takes its spawn command as
 * input, so tests feed a fixture emitting known ANSI and CI never touches
 * bun or OpenTUI. Production wires this executor: the provisioned bun runs
 * spool's supervisor, the supervisor owns the PTY, and the daemon speaks
 * wire frames to it over plain pipes.
 */

export interface TermSpawn {
	frameDir: string;
	entry: string;
	cols: number;
	rows: number;
}

export interface TermProcess {
	write(data: Uint8Array): void;
	resize(cols: number, rows: number): void;
	signal(sig: "SIGSTOP" | "SIGCONT"): void;
	kill(): void;
	onData(cb: (chunk: Uint8Array) => void): void;
	onExit(cb: (code: number) => void): void;
}

export type TermExecutor = (options: TermSpawn) => Promise<TermProcess>;

export function bunExecutor(ensure: () => Promise<Toolchain>): TermExecutor {
	return async ({ frameDir, entry, cols, rows }) => {
		const toolchain = await ensure();
		const child = spawn(toolchain.bunBin, [toolchain.supervisor, entry, String(cols), String(rows)], {
			cwd: frameDir,
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				...process.env,
				NODE_PATH: toolchain.nodePath,
				NODE_ENV: "production",
				TERM: "xterm-256color",
				COLORTERM: "truecolor",
			},
		});

		let dataCb: (chunk: Uint8Array) => void = () => {};
		let exitCb: (code: number) => void = () => {};
		let exited = false;
		const reportExit = (code: number) => {
			if (exited) return;
			exited = true;
			exitCb(code);
		};

		const decoder = createWireDecoder();
		child.stdout.on("data", (chunk: Buffer) => {
			for (const frame of decoder.push(new Uint8Array(chunk))) {
				if (frame.type === WIRE_DATA) {
					dataCb(frame.payload);
					continue;
				}
				const message = JSON.parse(new TextDecoder().decode(frame.payload)) as { exit?: { code: number } };
				if (message.exit !== undefined) reportExit(message.exit.code);
			}
		});
		child.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
		// a supervisor that dies without reporting still surfaces as an exit
		child.on("exit", (code) => reportExit(code ?? 1));
		child.on("error", () => reportExit(1));

		return {
			write: (data) => child.stdin.write(encodeData(data)),
			resize: (cols, rows) => child.stdin.write(encodeControl({ resize: { cols, rows } })),
			signal: (sig) => child.stdin.write(encodeControl({ signal: sig })),
			kill: () => {
				child.stdin.end();
				child.kill();
			},
			onData: (cb) => {
				dataCb = cb;
			},
			onExit: (cb) => {
				exitCb = cb;
			},
		};
	};
}
