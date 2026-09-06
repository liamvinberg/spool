import { randomUUID } from "node:crypto";
import { accessSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse, relative, sep } from "node:path";
import {
	createEditToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { AgentPermissions } from "../settings/registry";
import type { AgentReply } from "./agent-control";
import type { AgentEvent } from "./agent-events";

/** Resolve missing leaves through their real ancestors, including dangling links. */
export function canonicalFile(path: string, depth = 0): string {
	if (depth > 40) throw new Error("Too many symbolic links");
	const absolute = isAbsolute(path) ? path : `${process.cwd()}${sep}${path}`;
	const spelled = sep === "\\" ? absolute.replaceAll("/", sep) : absolute;
	const origin = parse(spelled).root;
	let current = origin;
	for (const part of spelled.slice(origin.length).split(sep)) {
		if (part === "" || part === ".") continue;
		if (part === "..") {
			current = dirname(current);
			continue;
		}
		const next = join(current, part);
		try {
			const stat = lstatSync(next);
			if (stat.isSymbolicLink()) {
				const link = readlinkSync(next);
				current = canonicalFile(isAbsolute(link) ? link : `${current}${sep}${link}`, depth + 1);
			} else current = realpathSync.native(next);
		} catch (error) {
			if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
			current = next;
		}
	}
	return current;
}
export function inside(path: string, directory: string): boolean {
	const part = relative(directory, path);
	return part === "" || (!isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`));
}

export class BundledFilePolicy {
	private readonly grants = new Set<string>();
	constructor(
		readonly root: string,
		readonly directory: string,
	) {}
	path(path: string): string {
		const target = canonicalFile(isAbsolute(path) ? path : `${this.root}${sep}${path}`);
		// Instance credentials, sessions and control state are never model input or output.
		const protectedPaths = this.protectedPaths();
		const controlLock =
			dirname(target) === canonicalFile(dirname(this.directory)) &&
			/^machine-state\.lock(?:$|\.)/.test(basename(target));
		if (controlLock || protectedPaths.some((one) => inside(target, canonicalFile(one))))
			throw new Error("Spool control and credential files are protected");
		return target;
	}
	protectedPaths(): string[] {
		return [
			this.directory,
			join(dirname(this.directory), "config.json"),
			join(dirname(this.directory), "daemon.json"),
			join(dirname(this.directory), "registry.json"),
			join(dirname(this.directory), "session.json"),
			join(dirname(this.directory), "daemon.log"),
			join(this.root, "design/.spool"),
			join(this.root, "design/canvas.json"),
		].map((path) => canonicalFile(path));
	}

	quiet(target: string, mode: AgentPermissions): boolean {
		return (
			mode !== "ask" ||
			inside(target, canonicalFile(join(this.root, "design"))) ||
			[...this.grants].some((scope) => inside(target, scope))
		);
	}
	grant(scope: string): void {
		this.grants.add(scope);
	}
	display(path: string): string {
		const part = relative(this.root, path);
		return part.startsWith("..") ? path : part || ".";
	}
}

export class BundledFileTurn {
	private readonly pending = new Map<string, { scope: string; finish: (allowed: boolean) => void }>();
	private stopped = false;
	constructor(
		readonly policy: BundledFilePolicy,
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
		if (held === undefined || (reply.kind !== "allow" && reply.kind !== "always" && reply.kind !== "deny"))
			return false;
		this.pending.delete(request);
		if (reply.kind === "always") this.policy.grant(held.scope);
		this.emit({ kind: "answered", request, answer: reply.kind, words: null, parent: null });
		held.finish(reply.kind !== "deny");
		return true;
	}
	apply(mode: AgentPermissions): void {
		this.mode = mode;
		if (mode !== "ask") for (const request of this.pending.keys()) this.answer(request, { kind: "allow" });
	}
	stop(): void {
		this.stopped = true;
		for (const request of this.pending.keys()) this.answer(request, { kind: "deny" });
	}
	private async authorize(
		id: string,
		tool: string,
		target: string,
		input: unknown,
		signal?: AbortSignal,
	): Promise<void> {
		if (this.stopped || signal?.aborted) throw new Error("Operation stopped");
		if (tool === "Read" || this.policy.quiet(target, this.mode)) return;
		const scope = dirname(target);
		const scopeLabel = `${this.policy.display(scope).replace(/\/$/, "")}/`;
		const request = randomUUID();
		const allowed = await new Promise<boolean>((finish) => {
			const abort = () => this.answer(request, { kind: "deny" });
			this.pending.set(request, {
				scope,
				finish: (value) => {
					signal?.removeEventListener("abort", abort);
					finish(value);
				},
			});
			signal?.addEventListener("abort", abort, { once: true });
			this.emit({
				kind: "asking",
				request,
				call: id,
				tool,
				display: tool,
				input,
				access: { scope: scopeLabel, path: this.policy.display(target) },
				description: `Allow edits in ${scopeLabel}?`,
				interaction: false,
				suggestions: [{ kind: "file", scope: scopeLabel }],
				parent: null,
			});
		});
		if (!allowed) throw new Error("File action denied");
	}
	tools(): ToolDefinition[] {
		return ["read", "write", "edit"].map((name): ToolDefinition => {
			// Each invocation gets its own authorization and operations; concurrent calls cannot borrow one.
			const definition =
				name === "read"
					? createReadToolDefinition(this.policy.root)
					: name === "write"
						? createWriteToolDefinition(this.policy.root)
						: createEditToolDefinition(this.policy.root);
			return {
				name: definition.name,
				label: definition.label,
				description: [definition.description, ...(definition.promptGuidelines ?? [])].join("\n"),
				parameters: definition.parameters,
				...(definition.promptSnippet === undefined ? {} : { promptSnippet: definition.promptSnippet }),
				...(definition.promptGuidelines === undefined ? {} : { promptGuidelines: definition.promptGuidelines }),
				execute: async (id, input, signal, update, context) => {
					const tool = name === "read" ? "Read" : name === "write" ? "Write" : "MultiEdit";
					const raw = input as { path: string; content?: string; edits?: { oldText: string; newText: string }[] };
					let nonExecution: string | undefined;
					try {
						const target = canonicalFile(
							isAbsolute(raw.path) ? raw.path : `${this.policy.root}${sep}${raw.path}`,
						);
						const translated = {
							...raw,
							file_path: target,
							edits: raw.edits?.map((pair) => ({ old_string: pair.oldText, new_string: pair.newText })),
						};
						this.emit({ kind: "called", id, tool, input: translated, parent: null });
						this.policy.path(target);
						nonExecution = "user-rejected";
						await this.authorize(id, tool, target, translated, signal);
						const check = () => {
							if (this.stopped || signal?.aborted) throw new Error("Operation stopped");
							if (this.policy.path(raw.path) !== target || this.policy.path(target) !== target)
								throw new Error("File target changed; request access again");
						};
						check();
						nonExecution = undefined;
						const readFile = async () => {
							check();
							return readFileSync(target);
						};
						const access = async () => {
							check();
							accessSync(target);
						};
						const writeFile = async (_path: string, content: string) => {
							check();
							writeFileSync(target, content);
						};
						const guarded =
							name === "read"
								? createReadToolDefinition(this.policy.root, {
										autoResizeImages: false,
										operations: {
											readFile,
											access,
											detectImageMimeType: async () => {
												const bytes = await readFile();
												if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
													return "image/png";
												if (bytes[0] === 255 && bytes[1] === 216) return "image/jpeg";
												if (bytes.subarray(0, 3).toString() === "GIF") return "image/gif";
												if (bytes.subarray(0, 2).toString() === "BM") return "image/bmp";
												if (
													bytes.subarray(0, 4).toString() === "RIFF" &&
													bytes.subarray(8, 12).toString() === "WEBP"
												)
													return "image/webp";
												return null;
											},
										},
									})
								: name === "write"
									? createWriteToolDefinition(this.policy.root, {
											operations: {
												writeFile,
												mkdir: async () => {
													check();
													mkdirSync(dirname(target), { recursive: true });
												},
											},
										})
									: createEditToolDefinition(this.policy.root, {
											operations: { access, readFile, writeFile },
										});
						const result = await (guarded as ToolDefinition).execute(
							id,
							{ ...raw, path: target },
							signal,
							update,
							context,
						);
						this.emit({
							kind: "result",
							id,
							failed: false,
							text: result.content
								.filter((part) => part.type === "text")
								.map((part) => part.text)
								.join("\n"),
							images: result.content.flatMap((part) =>
								part.type === "image" ? [{ media: part.mimeType, data: part.data }] : [],
							),
							parent: null,
						});
						return result;
					} catch (error) {
						const text = error instanceof Error ? error.message : "File action failed";
						this.emit({
							kind: "result",
							id,
							failed: true,
							...(nonExecution === undefined ? {} : { nonExecution }),
							text,
							images: [],
							parent: null,
						});
						throw error;
					}
				},
			};
		});
	}
}
