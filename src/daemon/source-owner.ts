import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { writeAtomic } from "../atomic-write";
import {
	type SourceOccurrence,
	type SourceRead,
	type SourceReceipt,
	type SourceResult,
	sameSourceOccurrence,
} from "../source-edit";
import type { ExecutedEdit } from "./bundled-editor";
import type { FrameCompiler } from "./compile";
import { assertDesignFile, realDesignDir, resolveDesignPath } from "./design-path";
import type { SourceObservation } from "./events";
import { applySpan, type HandOp, planOps, type SpanPatch, spanBetween } from "./hand-write";
import { lookupFrame } from "./projection";
import { directoryEntries, type RetainedCompilation, readInput, type SourceInput, sameInput } from "./retained-compile";
import type { SourceAgentAuthority, SourceAgentReply, SourceAgentRequest } from "./source-agent";
import { createSourceJournal } from "./source-journal";

interface OriginalRead {
	coverage: number;
	observer: string;
	root: string;
	frame: string;
	read: SourceRead;
	compilation: RetainedCompilation;
	file: string;
}
interface Receipt {
	operation: symbol;
	coverage: number;
	root: string;
	frame: string;
	file: string;
	compilation: RetainedCompilation;
	inverse: SpanPatch;
	original: SourceOccurrence;
	generation: number;
	retired: boolean;
}

/** The source owner's lifetime is the daemon's. Handles never authorize themselves. */
export function createSourceOwner(
	compiler: FrameCompiler,
	observe: (
		root: string,
		frame: string,
		generation: number,
		observer: string,
	) => Promise<SourceOccurrence | undefined>,
) {
	const owner = randomUUID();
	const reads = new Map<string, OriginalRead>();
	const receipts = new Map<string, Receipt>();
	const journal = createSourceJournal();
	const continuity = new Map<string, SourceInput>();
	const tails = new Map<string, Promise<unknown>>();
	const agentBarriers = new Map<string, Promise<void>>();
	let sequence = 0;
	let closed = false;
	const coverage = new Map<string, number>();
	const unobserved = new Set<string>();
	const watching = new Map<string, () => void>();
	const revocations = new Map<string, Set<() => void>>();
	const losses = new Map<string, Set<(all?: boolean) => void>>();
	let watchSource: ((root: string, listener: (event: SourceObservation) => void) => () => void) | undefined;
	function retire(root: string): void {
		for (const [id, held] of deliveries) if (held.root === root) delivered(id);
		for (const [handle, held] of reads) if (held.root === root) reads.delete(handle);
		for (const held of receipts.values()) if (held.root === root) held.retired = true;
		for (const lose of losses.get(root) ?? []) lose(true);
	}
	function observation(root: string, event: SourceObservation): void {
		if (event.kind !== "named") {
			if (event.kind === "lost") unobserved.add(root);
			// A known gap revokes in-flight work immediately. Named revalidation remains
			// ordered; a gap cannot wait behind the write acknowledgement it invalidates.
			coverage.set(root, (coverage.get(root) ?? 0) + 1);
			retire(root);
			for (const file of continuity.keys()) {
				const part = relative(root, file);
				if (!isAbsolute(part) && part !== ".." && !part.startsWith("../")) {
					journal.forget(file);
					continuity.delete(file);
				}
			}
			return;
		}
		void ordered(root, async () => {
			for (const held of [...reads.values(), ...receipts.values()]) {
				if (held.root !== root) continue;
				try {
					valid(root, held.compilation);
				} catch {
					if ("retired" in held) held.retired = true;
					else reads.delete(held.read.handle);
				}
			}
			for (const lose of losses.get(root) ?? []) lose();
		});
	}

	function watch(root: string): void {
		if (unobserved.has(root)) {
			watching.get(root)?.();
			watching.delete(root);
		}
		if (watchSource && !watching.has(root)) {
			unobserved.delete(root);
			watching.set(
				root,
				watchSource(root, (event) => observation(root, event)),
			);
		}
		if (unobserved.has(root)) throw new Error("source observation is unavailable; retry after it recovers");
	}

	const deliveries = new Map<
		string,
		{
			token: string;
			expires: number;
			root: string;
			compilation: RetainedCompilation;
			release: () => void;
			done: Promise<void>;
			timer: ReturnType<typeof setTimeout>;
		}
	>();
	function delivered(publication: string): void {
		const held = deliveries.get(publication);
		if (!held) return;
		deliveries.delete(publication);
		clearTimeout(held.timer);
		held.release();
	}
	function ordered<T>(root: string, run: () => Promise<T>): Promise<T> {
		const result = (tails.get(root) ?? Promise.resolve()).then(run, run);
		tails.set(
			root,
			result.then(
				async (value) => {
					await agentBarriers.get(root);
					if (
						typeof value === "object" &&
						value !== null &&
						"publication" in value &&
						value.publication &&
						typeof value.publication === "object" &&
						"packet" in value.publication
					) {
						const packet = value.publication.packet;
						if (typeof packet === "object" && packet !== null && "id" in packet && typeof packet.id === "string")
							await deliveries.get(packet.id)?.done;
					}
				},
				() => {},
			),
		);
		return result;
	}
	function valid(root: string, compilation: RetainedCompilation): void {
		if (closed) throw new Error("the source owner has stopped");
		if (unobserved.has(root)) throw new Error("source observation is unavailable");
		const design = realDesignDir(root);
		if (compilation.configurationError) throw new Error(compilation.configurationError);
		for (const [file, input] of compilation.configuration)
			if (!sameInput(input, readInput(file)))
				throw new Error("compiler configuration changed since this edit was read");
		for (const file of compilation.configurationAbsent)
			if (existsSync(file)) throw new Error("compiler configuration resolution changed since this edit was read");
		for (const [path, entries] of compilation.directories)
			if (directoryEntries(path) !== entries) {
				for (const receipt of receipts.values())
					if (receipt.compilation.directories.has(path)) receipt.retired = true;
				throw new Error("module resolution changed since this edit was read");
			}
		for (const file of compilation.absent)
			if (existsSync(resolveDesignPath(design, file))) throw new Error("an absent source dependency was created");
		for (const [file, input] of compilation.inputs) {
			assertDesignFile(design, file);
			const current = journal.current(file, input);
			continuity.set(file, current);
		}
	}
	function reason(error: unknown): string {
		return error instanceof Error ? error.message : "the source operation could not finish";
	}
	async function read(
		root: string,
		frame: string,
		original: SourceOccurrence,
		generation: number,
		observer: string,
	): Promise<{ ok: true; read: SourceRead } | { ok: false; reason: string }> {
		try {
			watch(root);
			const readingCoverage = coverage.get(root) ?? 0;
			const observed = await observe(root, frame, generation, observer);
			if (!observed || !sameSourceOccurrence(observed, original))
				throw new Error("the original committed occurrence is no longer eligible");
			const publication = compiler.publication(original.publication);
			if (!publication || publication.root !== root || publication.frame !== frame)
				throw new Error("the original source owner is no longer available");
			const { compilation } = publication;
			if (readingCoverage !== (coverage.get(root) ?? 0))
				throw new Error("source observation changed during the original read");
			valid(root, compilation);
			const cell = compilation.cells[original.cell];
			if (!cell || cell.value !== original.value)
				throw new Error("the selected words have no proven literal source");
			const found = lookupFrame(root, frame);
			if (found.kind !== "found") throw new Error("the original frame is no longer there");
			const file = join(realDesignDir(root), cell.file);
			if (!file.startsWith(`${found.dir}/`)) throw new Error("shared literal editing is not available yet");
			const handle = randomUUID();
			const read: SourceRead = {
				handle,
				owner,
				original: { ...original },
				generation,
				source: cell.source,
				role: "literal-child",
				value: cell.value,
			};
			reads.set(handle, { coverage: coverage.get(root) ?? 0, root, frame, read, compilation, file, observer });
			return { ok: true, read };
		} catch (error) {
			return { ok: false, reason: reason(error) };
		}
	}
	async function publish(
		held: OriginalRead,
		next: string,
		executed?: SpanPatch,
		inverseOf?: symbol,
	): Promise<SourceResult> {
		valid(held.root, held.compilation);
		if (held.coverage !== (coverage.get(held.root) ?? 0))
			throw new Error("source observation was lost before saving");
		const rebased = new Map(
			[...held.compilation.inputs].map(([file, input]) => [file, journal.current(file, input)]),
		);
		if ([...rebased].some(([file, input]) => !sameInput(input, held.compilation.inputs.get(file)!))) {
			const certified = await compiler.compilePublication(
				held.root,
				held.frame,
				rebased,
				sequence,
				held.compilation.absent,
				held.compilation,
			);
			if (certified.packet.shape !== held.compilation.packet.shape)
				throw new Error("the source role or executable context changed before saving");
			valid(held.root, certified);
		}
		if (held.coverage !== (coverage.get(held.root) ?? 0))
			throw new Error("source observation was lost before saving");
		const originalInput = held.compilation.inputs.get(held.file);
		const input = originalInput ? journal.current(held.file, originalInput) : undefined;
		if (!input) throw new Error("the original compiler input is missing");
		const before = input.bytes.toString("utf8");
		const compatibleBefore = compiler.matchingPublications(
			held.root,
			held.frame,
			rebased,
			held.compilation.packet.shape,
		);
		if (next === before) return { ok: true, source: "unchanged", publication: null };
		const frozen = new Map([...held.compilation.inputs].map(([file, input]) => [file, journal.current(file, input)]));
		// Source remains ordinary files. This final synchronous check and rename
		// cannot exclude an uncoordinated process saving after the check.
		writeAtomic(held.file, next);
		const after = readInput(held.file);
		const forward = executed ?? spanBetween(next, before);
		const operation = journal.record(
			held.file,
			input,
			after,
			[{ ...forward, before: before.slice(forward.start, forward.end) }],
			inverseOf,
		);
		frozen.set(held.file, after);
		for (const [file, input] of frozen) continuity.set(file, input);
		const receipt: SourceReceipt = { owner, handle: randomUUID() };
		const saved = { ...held.compilation, inputs: frozen };
		const inverse: Receipt = {
			operation,
			coverage: held.coverage,
			root: held.root,
			frame: held.frame,
			file: held.file,
			compilation: saved,
			inverse: {
				start: forward.start,
				end: forward.start + forward.text.length,
				text: before.slice(forward.start, forward.end),
			},
			original: held.read.original,
			generation: held.read.generation,
			retired: false,
		};
		receipts.set(receipt.handle, inverse);
		try {
			const retained = await compiler.compilePublication(
				held.root,
				held.frame,
				frozen,
				++sequence,
				held.compilation.absent,
				held.compilation,
			);
			if (held.coverage !== (coverage.get(held.root) ?? 0))
				throw new Error("source observation was lost after saving");
			if (retained.packet.shape !== held.compilation.packet.shape)
				throw new Error("saved source has a different executable shape");
			inverse.compilation = retained;
			let release = () => {};
			const done = new Promise<void>((resolve) => {
				release = resolve;
			});
			const timer = setTimeout(() => delivered(retained.packet.id), 6000);
			timer.unref();
			const admission = { token: randomUUID(), expires: Date.now() + 6000 };
			deliveries.set(retained.packet.id, {
				...admission,
				root: held.root,
				compilation: retained,
				release,
				done,
				timer,
			});
			return {
				ok: true,
				source: "saved",
				publication: {
					admission,
					owner,
					frame: held.frame,
					before: held.compilation.packet.id,
					compatibleBefore,
					packet: retained.packet,
					generation: held.read.generation,
					original: held.read.original,
					receipt,
				},
				receipt,
			};
		} catch (error) {
			return { ok: true, source: "saved", publication: null, receipt, reason: reason(error) };
		}
	}
	function commit(
		root: string,
		handle: string,
		generation: number,
		original: SourceOccurrence,
		ops: readonly HandOp[],
	): Promise<SourceResult> {
		return ordered(root, async () => {
			const held = reads.get(handle);
			reads.delete(handle); // exactly one completion, including a failed or unknown attempt
			try {
				if (
					!held ||
					held.root !== root ||
					held.read.generation !== generation ||
					!sameSourceOccurrence(held.read.original, original)
				)
					throw new Error("the original edit is no longer eligible");
				const observed = await observe(root, held.frame, generation, held.observer);
				if (!observed || !sameSourceOccurrence(observed, held.read.original))
					throw new Error("the original committed occurrence changed before saving");
				valid(root, held.compilation);
				if (ops.length !== 1 || ops.some((op) => op.kind !== "set-text" || op.source !== held.read.source))
					throw new Error("this source read does not authorize that operation");
				const source = held.compilation.inputs.get(held.file)?.bytes.toString("utf8");
				if (source === undefined) throw new Error("the original source read is incomplete");
				const planned = planOps(source, ops);
				if (!planned.ok) throw new Error(planned.refusal.says);
				const input = held.compilation.inputs.get(held.file);
				if (!input) throw new Error("the original source input is missing");
				const patch = journal.transform(held.file, input, planned.patches)[0];
				if (!patch) throw new Error("the source patch is missing");
				return await publish(
					held,
					applySpan(journal.current(held.file, input).bytes.toString("utf8"), patch),
					patch,
				);
			} catch (error) {
				return { ok: false, reason: reason(error) };
			}
		});
	}
	function inverse(root: string, receipt: SourceReceipt): Promise<SourceResult> {
		return ordered(root, async () => {
			const held = receipts.get(receipt.handle);
			try {
				if (receipt.owner !== owner || !held || held.root !== root || held.retired)
					throw new Error("this source undo is no longer available");
				valid(root, held.compilation);
				held.retired = true;
				const source = held.compilation.inputs.get(held.file)?.bytes.toString("utf8");
				if (source === undefined) throw new Error("the inverse source read is incomplete");
				const input = held.compilation.inputs.get(held.file);
				if (!input) throw new Error("the original input is missing");
				const transformed = journal.transform(held.file, input, [held.inverse])[0];
				if (!transformed) throw new Error("the inverse source span is missing");
				const cell = held.compilation.cells[held.original.cell];
				if (!cell) throw new Error("the original source role changed");
				return await publish(
					{
						observer: "",
						coverage: held.coverage,
						root,
						frame: held.frame,
						file: held.file,
						compilation: held.compilation,
						read: {
							handle: "",
							owner,
							original: held.original,
							generation: held.generation,
							role: "literal-child",
							source: cell.source,
							value: cell.value,
						},
					},
					applySpan(journal.current(held.file, input).bytes.toString("utf8"), transformed),
					transformed,
					held.operation,
				);
			} catch (error) {
				if (held) held.retired = true;
				return { ok: false, reason: reason(error) };
			}
		});
	}
	function current(root: string, publication: string): boolean {
		const held = compiler.publication(publication);
		if (!held || held.root !== root) return false;
		try {
			valid(root, held.compilation);
			return [...held.compilation.inputs].every(([file, input]) => sameInput(input, readInput(file)));
		} catch {
			return false;
		}
	}
	function admit(token: string): boolean {
		const held = [...deliveries.values()].find((delivery) => delivery.token === token);
		if (!held || Date.now() >= held.expires) return false;
		try {
			valid(held.root, held.compilation);
			return [...held.compilation.inputs].every(([file, input]) => sameInput(input, readInput(file)));
		} catch {
			return false;
		}
	}
	function agent(root: string, alive: () => boolean): SourceAgentAuthority {
		watch(root);
		const canonicalRoot = realpathSync(root);
		const rootStat = lstatSync(canonicalRoot);
		const rootIdentity = `${rootStat.dev}:${rootStat.ino}`;
		const canonicalDesign = realDesignDir(root);
		const designStat = lstatSync(canonicalDesign);
		const designIdentity = `${designStat.dev}:${designStat.ino}`;
		function ancestors(path: string): string {
			const identities: string[] = [];
			for (let directory = dirname(path); ; directory = dirname(directory)) {
				if (existsSync(directory)) {
					const stat = lstatSync(directory);
					identities.push(`${directory}:${stat.dev}:${stat.ino}`);
				}
				if (directory === canonicalRoot || dirname(directory) === directory) break;
			}
			return identities.join("\n");
		}
		let active = true;
		const originalReads = new Map<string, { path: string; input: SourceInput }>();
		const fullReads = new Map<string, SourceInput>();
		const latestRead = new Map<string, string>();
		const prepared = new Map<
			string,
			{ path: string; input: SourceInput | null; operation: "edit" | "write"; ancestors: string }
		>();
		const replacements = new Map<
			string,
			{ path: string; output: string; input: SourceInput; release(): void; timer: ReturnType<typeof setTimeout> }
		>();
		const lose = (all = false) => {
			if (all) {
				originalReads.clear();
				fullReads.clear();
				prepared.clear();
				for (const handle of replacements.keys()) finish(handle, false);
				return;
			}
			for (const [path, input] of fullReads) {
				try {
					journal.current(path, input);
				} catch {
					fullReads.delete(path);
				}
			}
			for (const [handle, held] of originalReads) {
				try {
					journal.current(held.path, held.input);
				} catch {
					originalReads.delete(handle);
				}
			}
		};
		const group = losses.get(root) ?? new Set<(all?: boolean) => void>();
		group.add(lose);
		losses.set(root, group);
		function check(): void {
			try {
				const stat = lstatSync(root);
				const design = lstatSync(canonicalDesign);
				if (
					closed ||
					unobserved.has(root) ||
					!active ||
					!alive() ||
					realpathSync(root) !== canonicalRoot ||
					realDesignDir(root) !== canonicalDesign ||
					`${design.dev}:${design.ino}` !== designIdentity ||
					`${stat.dev}:${stat.ino}` !== rootIdentity
				)
					throw new Error("the source session is no longer available");
			} catch (error) {
				revoke();
				throw error;
			}
		}

		function target(path: string): boolean {
			check();
			const part = relative(canonicalDesign, path);
			if (/(^|\/)frame\.json$/.test(part)) return false;
			if (isAbsolute(part) || part === ".." || part.startsWith("../")) return false;
			const design = realDesignDir(root);
			if (resolveDesignPath(design, path) !== path) throw new Error("the source target changed");
			if (existsSync(path) && lstatSync(path).nlink !== 1)
				throw new Error("linked source files cannot be coordinated");
			return true;
		}
		function finish(handle: string, complete: boolean): void {
			const held = replacements.get(handle);
			replacements.delete(handle);
			if (!held) throw new Error("the source write acknowledgement was lost");
			clearTimeout(held.timer);
			agentBarriers.delete(root);
			try {
				if (!complete) {
					journal.forget(held.path);
					retire(root);
				} else if (
					held.input.bytes.toString("utf8") === held.output &&
					sameInput(held.input, journal.observe(held.path))
				)
					fullReads.set(held.path, held.input);
			} catch (error) {
				journal.forget(held.path);
				retire(root);
				throw error;
			} finally {
				held.release();
			}
		}
		async function request(message: SourceAgentRequest): Promise<SourceAgentReply> {
			if (message.kind === "discard") {
				originalReads.delete(message.handle);
				prepared.delete(message.handle);
				if (replacements.has(message.handle)) finish(message.handle, false);
				return { kind: "done" };
			}
			if (message.kind === "acknowledge") {
				check();
				finish(message.handle, message.complete);
				return { kind: "done" };
			}
			return ordered(root, async () => {
				check();
				if (message.kind === "read") {
					if (!target(message.path)) return { kind: "outside" };
					fullReads.delete(message.path);
					const input = journal.observe(message.path);
					const handle = randomUUID();
					originalReads.set(handle, { path: message.path, input });
					latestRead.set(message.path, handle);
					return { kind: "read", handle, bytes: input.bytes.toString("base64") };
				}
				if (message.kind === "read-complete") {
					const held = originalReads.get(message.handle);
					originalReads.delete(message.handle);
					if (!held) throw new Error("the original read is no longer available");
					target(held.path);
					if (
						latestRead.get(held.path) === message.handle &&
						message.complete &&
						sameInput(held.input, journal.observe(held.path))
					)
						fullReads.set(held.path, held.input);
					return { kind: "done" };
				}
				if (message.kind === "prepare") {
					if (!target(message.path)) return { kind: "outside" };
					const input = fullReads.get(message.path);
					fullReads.delete(message.path);
					for (const [id, held] of originalReads) if (held.path === message.path) originalReads.delete(id);
					const absent = message.operation === "write" && !existsSync(message.path);
					if (!absent && !input) throw new Error("read the complete source file before editing it");
					if (input) {
						const current = journal.current(message.path, input);
						if (message.operation === "write" && !sameInput(input, current))
							throw new Error("read the current source before replacing the whole file");
					}
					const handle = randomUUID();
					prepared.set(handle, {
						path: message.path,
						input: absent ? null : (input ?? null),
						operation: message.operation,
						ancestors: ancestors(message.path),
					});
					return { kind: "prepared", handle, bytes: absent ? null : (input?.bytes.toString("base64") ?? null) };
				}
				if (message.kind === "replace") {
					const held = prepared.get(message.handle);
					prepared.delete(message.handle);
					if (!held) throw new Error("the source write record is no longer available");
					target(held.path);
					if (ancestors(held.path) !== held.ancestors)
						throw new Error("source ancestors changed before replacement");
					const raw = held.input?.bytes.toString("utf8") ?? "";
					let edits: ExecutedEdit[] | null = held.operation === "write" ? null : message.edits;
					let output = message.output;
					let before: SourceInput | undefined;
					if (held.input) {
						before = journal.current(held.path, held.input);
						if (edits) {
							let rebuilt = raw;
							for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
								if (raw.slice(edit.start, edit.end) !== edit.before)
									throw new Error("executed source match is invalid");
								rebuilt = applySpan(rebuilt, edit);
							}
							if (rebuilt !== output) throw new Error("executed source matches do not explain the output");
							const transformed = journal.transform(held.path, held.input, edits);
							const current = before.bytes.toString("utf8");
							edits = transformed.map((patch) => ({ ...patch, before: current.slice(patch.start, patch.end) }));
							output = current;
							for (const edit of [...edits].sort((a, b) => b.start - a.start)) output = applySpan(output, edit);
						} else if (!sameInput(held.input, before))
							throw new Error("an opaque write needs a fresh current source read");
					} else if (existsSync(held.path)) throw new Error("the checked absent source file now exists");
					check();
					target(held.path);
					if (before && !sameInput(before, readInput(held.path)))
						throw new Error("source changed before replacement");
					mkdirSync(dirname(held.path), { recursive: true });
					writeAtomic(held.path, output);
					const after = readInput(held.path);
					if (before) journal.record(held.path, before, after, edits);
					else journal.observe(held.path);
					continuity.set(held.path, after);
					let release = () => {};
					const done = new Promise<void>((resolve) => {
						release = resolve;
					});
					agentBarriers.set(root, done);
					const timer = setTimeout(() => {
						if (replacements.has(message.handle)) finish(message.handle, false);
					}, 6000);
					timer.unref();
					replacements.set(message.handle, {
						path: held.path,
						output: message.output,
						input: after,
						release,
						timer,
					});
					return { kind: "replaced", output };
				}
				throw new Error("invalid source operation");
			});
		}
		function revoke(): void {
			active = false;
			group.delete(lose);
			revocations.get(root)?.delete(revoke);
			for (const handle of replacements.keys()) finish(handle, false);
			originalReads.clear();
			fullReads.clear();
			prepared.clear();
			replacements.clear();
		}
		const supervisors = revocations.get(root) ?? new Set<() => void>();
		supervisors.add(revoke);
		revocations.set(root, supervisors);
		return { request, revoke, unknown: () => replacements.size > 0 };
	}

	function forget(root: string): void {
		for (const revoke of revocations.get(root) ?? []) revoke();
		observation(root, { kind: "lost" });
		watching.get(root)?.();
		watching.delete(root);
	}
	return {
		owner,
		keepProjects: (roots: readonly string[]) => {
			for (const root of new Set([...watching.keys(), ...revocations.keys()]))
				if (!roots.includes(root)) forget(root);
		},
		forget,
		agent,
		observe: observation,
		watchSource: (subscribe: NonNullable<typeof watchSource>) => {
			watchSource = subscribe;
		},
		close: () => {
			closed = true;
			for (const root of revocations.keys()) for (const revoke of revocations.get(root) ?? []) revoke();
			for (const root of new Set([...watching.keys(), ...losses.keys()])) retire(root);
			for (const stop of watching.values()) stop();
			watching.clear();
		},
		admit,
		read,
		commit,
		inverse,
		current,
		delivered,
		cancel: (root: string, handle: string) => {
			if (reads.get(handle)?.root === root) reads.delete(handle);
		},
	};
}
