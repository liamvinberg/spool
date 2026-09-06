import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgentPermissions } from "../settings/registry";
import { shotFile, shotTileFile } from "../verify";
import type { AgentReply } from "./agent-control";
import type { AgentEvent, AgentImage } from "./agent-events";
import { SPOOL_COMMAND_GUIDANCE, trustedCommand } from "./bundled-command-route";
import { type BundledFilePolicy, canonicalFile, inside } from "./bundled-files";
import { runCommand, sandboxCommand } from "./bundled-sandbox";

export class BundledCommandPolicy {
	readonly scratch = canonicalFile(mkdtempSync(join(tmpdir(), "spool-command-")));
	readonly grants = new Set<string>();
	unrestricted = false;
	constructor(readonly files: BundledFilePolicy) {
		// Generic shell lookup must fail here, never discover another Spool on PATH.
		const bin = join(this.scratch, "bin");
		mkdirSync(bin, { mode: 0o700 });
		writeFileSync(join(bin, "spool"), `#!/bin/sh\nprintf '%s\\n' '${SPOOL_COMMAND_GUIDANCE}' >&2\nexit 126\n`, {
			mode: 0o500,
		});
	}
	close(): void {
		rmSync(this.scratch, { recursive: true, force: true });
	}
}

/** Allowlisted process necessities only, including when access is explicitly unrestricted. */
export function commandEnvironment(scratch: string): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = {
		HOME: userInfo().homedir,
		TMPDIR: scratch,
		TMP: scratch,
		TEMP: scratch,
		PATH: `${join(scratch, "bin")}:${process.env.PATH ?? "/usr/bin:/bin"}`,
	};
	for (const key of ["SystemRoot", "WINDIR", "LANG", "LC_ALL"])
		if (process.env[key] !== undefined) env[key] = process.env[key];
	return env;
}
const parameters = Type.Object({
	command: Type.String({
		description:
			"Shell command. Exact spool skill/check/shot/logs/url/selection/flows/status invocations use this installed package directly.",
	}),
	description: Type.Optional(Type.String({ description: "Short purpose shown in the rail." })),
	writable_paths: Type.Optional(
		Type.Array(Type.String(), {
			description:
				"Additional writable files or directories to request before sandboxed execution. File-tool grants do not cover commands.",
		}),
	),
	unsandboxed: Type.Optional(
		Type.Boolean({
			description:
				"Request unrestricted commands with your account's filesystem access. Requires explicit approval unless already granted or bypass is applied.",
		}),
	),
	timeout: Type.Optional(Type.Number({ minimum: 1, maximum: 600, description: "Timeout in seconds; default 120." })),
});
type Input = {
	command: string;
	description?: string;
	writable_paths?: string[];
	unsandboxed?: boolean;
	timeout?: number;
};
export class BundledCommandTurn {
	private readonly pending = new Map<string, { paths: string[] | null; finish: (allowed: boolean) => void }>();
	private readonly active = new Set<AbortController>();
	private stopped = false;
	constructor(
		readonly policy: BundledCommandPolicy,
		public mode: AgentPermissions,
		private emit: (event: AgentEvent) => void,
	) {}
	begin(mode: AgentPermissions, emit: (event: AgentEvent) => void): void {
		this.mode = mode;
		this.emit = emit;
		this.stopped = false;
	}
	answer(request: string, reply: AgentReply): boolean {
		const held = this.pending.get(request);
		if (!held || !["allow", "always", "deny"].includes(reply.kind)) return false;
		this.pending.delete(request);
		if (reply.kind === "always") {
			if (held.paths === null) this.policy.unrestricted = true;
			else for (const path of held.paths) this.policy.grants.add(path);
		}
		this.emit({
			kind: "answered",
			request,
			answer: reply.kind as "allow" | "always" | "deny",
			words: null,
			parent: null,
		});
		held.finish(reply.kind !== "deny");
		return true;
	}
	apply(mode: AgentPermissions): void {
		this.mode = mode;
		if (mode === "bypass") for (const request of this.pending.keys()) this.answer(request, { kind: "allow" });
	}
	stop(): void {
		this.stopped = true;
		for (const request of this.pending.keys()) this.answer(request, { kind: "deny" });
		for (const controller of this.active) controller.abort();
	}
	private async approve(id: string, input: Input, paths: string[] | null, unavailable: boolean, signal: AbortSignal) {
		if (this.stopped || signal.aborted) throw new Error("Command stopped");
		if (this.mode === "bypass" || this.policy.unrestricted) return;
		const request = randomUUID();
		const scope = paths === null ? "commands" : paths.map((path) => this.policy.files.display(path)).join(", ");
		const allowed = await new Promise<boolean>((finish) => {
			const abort = () => this.answer(request, { kind: "deny" });
			this.pending.set(request, {
				paths,
				finish: (value) => {
					signal.removeEventListener("abort", abort);
					finish(value);
				},
			});
			signal.addEventListener("abort", abort, { once: true });
			this.emit({
				kind: "asking",
				request,
				call: id,
				tool: "Bash",
				display: "Bash",
				input,
				access: {
					kind: "command",
					scope,
					path: input.description ?? input.command,
					command: input.command,
					unavailable,
				},
				description:
					paths === null
						? "Allow commands to read and change files your account can access?"
						: `Allow commands to change files in ${scope}?`,
				interaction: false,
				suggestions: [{ kind: "command", scope }],
				parent: null,
			});
		});
		if (!allowed) throw new Error("Command denied");
	}
	tool(): ToolDefinition {
		return {
			name: "bash",
			label: "Run command",
			parameters,
			description:
				"Run shell commands with writes restricted to design/, dedicated scratch and runtime temp paths. Reads and outbound web access are quiet. Request additional writable_paths explicitly. Use unsandboxed for broader browser/system access. A failed command is never rerun automatically. Use one exact spool verification command per call; these are trusted and return all shot images. Other bare spool invocations are refused, including in compound or nested shell commands. Isolation is tool-process filesystem containment, not complete network/application API isolation; explicitly unrestricted commands have your account's filesystem access.",
			execute: async (id, raw, signal) => {
				const input = raw as Input;
				const controller = new AbortController();
				const abort = () => controller.abort();
				signal?.addEventListener("abort", abort, { once: true });
				if (this.stopped || signal?.aborted) controller.abort();
				this.active.add(controller);
				let executed = false;
				let recorded = false;
				let cleanup: (() => void) | undefined;
				this.emit({ kind: "called", id, tool: "Bash", input, parent: null });
				try {
					const { files, scratch } = this.policy;
					const trusted = trustedCommand(input.command);
					if (!trusted && /^spool(?:\s|$)/.test(input.command.trim())) throw new Error(SPOOL_COMMAND_GUIDANCE);
					let argv: string[] = ["/bin/bash", "--noprofile", "--norc", "-c", input.command];
					let env = commandEnvironment(scratch);
					if (trusted) {
						const source = import.meta.url.endsWith(".ts");
						const cli = fileURLToPath(new URL(source ? "../cli.ts" : "./cli.js", import.meta.url));
						argv = [
							process.execPath,
							...(source ? ["--import", import.meta.resolve("tsx")] : []),
							cli,
							...trusted,
						];
						env.SPOOL_DIR = dirname(files.directory);
						// Electron's executable needs Node mode; this is a constant, never inherited argv/env.
						if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = "1";
					} else {
						const paths = (input.writable_paths ?? []).map((path) => files.path(path));
						const design = canonicalFile(join(files.root, "design"));
						const extra = paths.filter(
							(path) =>
								!inside(path, design) &&
								!inside(path, scratch) &&
								![...this.policy.grants].some((scope) => inside(path, scope)),
						);
						if (input.unsandboxed) await this.approve(id, input, null, false, controller.signal);
						else if (extra.length) await this.approve(id, input, extra, false, controller.signal);
						if (this.mode !== "bypass" && !this.policy.unrestricted && !input.unsandboxed) {
							// Recheck links after approval; widening must name the path that will actually be used.
							if (paths.some((path, index) => files.path(input.writable_paths?.[index] ?? "") !== path))
								throw new Error("Command target changed; request access again");
							mkdirSync(design, { recursive: true });
							const protectedPaths = [
								...files.protectedPaths(),
								join(dirname(files.directory), "machine-state.lock*"),
							];
							try {
								const wrapped = await sandboxCommand(
									input.command,
									files.root,
									{
										allowWrite: [design, scratch, ...paths],
										denyRead: protectedPaths,
										denyWrite: protectedPaths,
									},
									controller.signal,
								);
								cleanup = wrapped.cleanup;
								argv = wrapped.argv;
								env = { ...env, ...wrapped.env };
							} catch {
								await this.approve(id, input, null, true, controller.signal);
							}
						}
					}
					executed = true;
					const result = await runCommand(
						argv,
						files.root,
						env,
						controller.signal,
						input.timeout ?? 120,
						join(scratch, `${randomUUID()}.log`),
					);
					const images: AgentImage[] = [];
					if (trusted?.[0] === "shot" && trusted[1]) {
						const frame = trusted[1];
						for (const path of result.stdout.trim().split("\n")) {
							const tile = new RegExp(`^${frame}\\.([1-9][0-9]*)\\.png$`).exec(basename(path));
							const expected =
								path === shotFile(files.root, frame) ||
								(tile !== null && path === shotTileFile(files.root, frame, Number(tile[1])));
							if (expected && canonicalFile(path) === path)
								images.push({ media: "image/png", data: readFileSync(path).toString("base64") });
						}
					}
					const text = `${result.text}${result.code === 0 ? "" : `\nCommand exited with code ${result.code}`}`;
					this.emit({ kind: "result", id, failed: result.code !== 0, text, images, parent: null });
					recorded = true;
					if (result.code !== 0 && images.length === 0) throw new Error(text);
					return {
						content: [
							{ type: "text", text: text || "Command completed" },
							...images.map((image) => ({ type: "image" as const, mimeType: image.media, data: image.data })),
						],
						details: { exitCode: result.code },
					};
				} catch (error) {
					if (!recorded)
						this.emit({
							kind: "result",
							id,
							failed: true,
							...(executed ? {} : { nonExecution: "user-rejected" }),
							text: error instanceof Error ? error.message : "Command failed",
							images: [],
							parent: null,
						});
					throw error;
				} finally {
					cleanup?.();
					signal?.removeEventListener("abort", abort);
					this.active.delete(controller);
				}
			},
		};
	}
}
