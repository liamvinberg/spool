import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { writeAtomic } from "../atomic-write";
import {
	type SourceInventory,
	type SourceOccurrence,
	type SourcePublication,
	type SourceRead,
	type SourceReceipt,
	type SourceResult,
	type SourceUse,
	sameSourceOccurrence,
	type UseOutcome,
} from "../source-edit";
import type { FrameCompiler } from "./compile";
import { assertDesignFile, realDesignDir, resolveDesignPath } from "./design-path";
import { writeFactoryLiteral } from "./factory-literal";
import { applySpan, type HandOp, planOps, type SpanPatch, spanBetween } from "./hand-write";
import { lookupFrame } from "./projection";
import { directoryEntries, type RetainedCompilation, readInput, type SourceInput, sameInput } from "./retained-compile";
import { sourceHistoryCompilation } from "./source-history";
import type { Target } from "./source-origins";
import { sourceTarget } from "./source-syntax";
import { resolveTextSource } from "./source-target";

interface OriginalRead {
	observer: string;
	target?: Target;
	history?: RetainedCompilation;
	root: string;
	frame: string;
	read: SourceRead;
	compilation: RetainedCompilation;
	file: string;
}
interface Receipt {
	required: RetainedCompilation;
	cell: string;
	reach?: SourceRead["reach"];
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
	dependencyFrames: (root: string, file: string) => Promise<string[] | undefined> = async () => undefined,
) {
	const owner = randomUUID();
	const reads = new Map<string, OriginalRead>();
	const receipts = new Map<string, Receipt>();
	const continuity = new Map<string, SourceInput>();
	const tails = new Map<string, Promise<unknown>>();
	let sequence = 0;
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
		const design = realDesignDir(root);
		if (compilation.configurationError) throw new Error(compilation.configurationError);
		for (const [file, input] of compilation.configuration)
			if (!sameInput(input, readInput(file)))
				throw new Error("compiler configuration changed since this edit was read");
		for (const file of compilation.configurationAbsent)
			if (existsSync(file)) throw new Error("compiler configuration resolution changed since this edit was read");
		for (const [path, entries] of compilation.directories)
			if (directoryEntries(path) !== entries) {
				for (const receipt of receipts.values()) if (receipt.required.directories.has(path)) receipt.retired = true;
				throw new Error("module resolution changed since this edit was read");
			}
		for (const file of compilation.absent)
			if (existsSync(resolveDesignPath(design, file))) throw new Error("an absent source dependency was created");
		for (const [file, input] of compilation.inputs) {
			assertDesignFile(design, file);
			const current = readInput(file);
			const previous = continuity.get(file);
			if (previous && !sameInput(previous, current)) {
				// Detect an outside writer against the latest coordinated state, not
				// an older history entry. Retired evidence never revives on equal bytes.
				for (const receipt of receipts.values()) if (receipt.required.inputs.has(file)) receipt.retired = true;
				for (const [handle, read] of reads) if (read.compilation.inputs.has(file)) reads.delete(handle);
			}
			continuity.set(file, current);
			if (!sameInput(input, current)) throw new Error("the source changed since this edit was read");
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
			const observed = await observe(root, frame, generation, observer);
			if (!observed || !sameSourceOccurrence(observed, original))
				throw new Error("the original committed occurrence is no longer eligible");
			const publication = compiler.publication(original.publication);
			if (!publication || publication.root !== root || publication.frame !== frame)
				throw new Error("the original source owner is no longer available");
			const { compilation } = publication;
			valid(root, compilation);

			const { cellKey, cell, target } = resolveTextSource(root, compilation, original, generation);
			const found = lookupFrame(root, frame);
			if (found.kind !== "found") throw new Error("the original frame is no longer there");
			const file = sourceTarget(root, cell.file, compilation.inputs).file;
			const handle = randomUUID();
			const read: SourceRead = {
				handle,
				owner,
				original: { ...original },
				generation,
				source: cell.source,
				role:
					target?.syntax === "react-call" ? "factory-literal" : cell.field ? "literal-attribute" : "literal-child",
				cell: cellKey,
				...(cell.field ? { field: cell.field } : {}),
				scope: target?.role ?? "definition",
				repeated: target?.repeated ?? false,
				value: cell.value,
			};
			reads.set(handle, { root, frame, read, compilation, file, observer, ...(target ? { target } : {}) });
			return { ok: true, read };
		} catch (error) {
			return { ok: false, reason: reason(error) };
		}
	}
	async function reach(
		root: string,
		handle: string,
		inventories: SourceInventory[],
	): Promise<{ ok: true; read: SourceRead } | { ok: false; reason: string }> {
		try {
			const held = reads.get(handle);
			if (!held || held.root !== root) throw new Error("the original source read is no longer available");
			valid(root, held.compilation);
			const uses: SourceUse[] = [];
			const unknown = new Set<string>();
			const mounted = new Set(inventories.map((inventory) => inventory.frame));
			const cell = held.read.cell ?? held.read.original.cell;
			for (const inventory of inventories) {
				const publication = compiler.publication(inventory.publication);
				if (!publication || publication.root !== root || publication.frame !== inventory.frame) {
					unknown.add(inventory.frame);
					continue;
				}
				if (!publication.compilation.cells[cell]) continue;
				try {
					valid(root, publication.compilation);
				} catch {
					unknown.add(inventory.frame);
					continue;
				}
				if (inventory.unknown > 0) unknown.add(inventory.frame);
				for (const use of inventory.uses) {
					if (use.original.publication !== inventory.publication) {
						unknown.add(inventory.frame);
						continue;
					}
					try {
						const target = resolveTextSource(root, publication.compilation, use.original, held.read.generation);
						if (
							target.cellKey === cell &&
							!uses.some(
								(other) =>
									other.frame === inventory.frame && other.original.occurrence === use.original.occurrence,
							)
						)
							uses.push({ frame: inventory.frame, ...use });
					} catch {
						unknown.add(inventory.frame);
					}
				}
			}
			const dependent = await dependencyFrames(root, held.file);
			if (!dependent) unknown.add("source coverage");
			const unmounted = (dependent ?? []).filter((frame) => !mounted.has(frame));
			held.read = { ...held.read, reach: { uses, unmounted, unknown: [...unknown] } };
			return { ok: true, read: held.read };
		} catch (error) {
			return { ok: false, reason: reason(error) };
		}
	}

	async function publish(held: OriginalRead, next: string): Promise<SourceResult> {
		valid(held.root, held.history ?? held.compilation);
		const input = held.compilation.inputs.get(held.file);
		if (!input) throw new Error("the original compiler input is missing");
		const before = input.bytes.toString("utf8");
		if (next === before) return { ok: true, source: "unchanged", publication: null };
		const frozen = new Map<string, SourceInput>(held.compilation.inputs);
		// Source remains ordinary files. This final synchronous check and rename
		// cannot exclude an uncoordinated process saving after the check.
		writeAtomic(held.file, next);
		frozen.set(held.file, readInput(held.file));
		for (const [file, input] of frozen) continuity.set(file, input);
		const receipt: SourceReceipt = { owner, handle: randomUUID() };
		const saved = { ...held.compilation, inputs: frozen };
		const inverse: Receipt = {
			required: sourceHistoryCompilation(held.root, saved, held.file),
			cell: held.read.cell ?? held.read.original.cell,
			...(held.read.reach ? { reach: held.read.reach } : {}),
			root: held.root,
			frame: held.frame,
			file: held.file,
			compilation: saved,
			inverse: spanBetween(before, next),
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
			if (retained.packet.shape !== held.compilation.packet.shape)
				throw new Error("saved source has a different executable shape");
			inverse.compilation = retained;
			inverse.required = sourceHistoryCompilation(held.root, retained, held.file);
			// A coordinated inverse can restore an earlier receipt's complete input
			// bytes. Advance that live receipt to this publication and file identity.
			for (const receipt of receipts.values()) {
				if (
					!receipt.retired &&
					receipt.root === held.root &&
					[...receipt.required.inputs].every(([file, input]) =>
						retained.inputs.get(file)?.bytes.equals(input.bytes),
					)
				)
					receipt.required = sourceHistoryCompilation(held.root, retained, receipt.file);
				if (receipt.retired || receipt.root !== held.root || receipt.frame !== held.frame) continue;
				if (receipt.compilation.inputs.size !== retained.inputs.size) continue;
				if (
					[...receipt.compilation.configuration].some(([file, input]) => {
						const current = retained.configuration.get(file);
						return !current || !sameInput(input, current);
					})
				) {
					receipt.retired = true;
					continue;
				}
				if (
					[...receipt.compilation.inputs].every(([file, input]) =>
						retained.inputs.get(file)?.bytes.equals(input.bytes),
					)
				)
					receipt.compilation = retained;
			}
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

			const related: SourcePublication[] = [];
			const failures: UseOutcome[] = [];
			const uses = held.read.reach?.uses ?? [];
			for (const frame of new Set(uses.map((use) => use.frame))) {
				if (frame === held.frame) continue;
				const targets = uses.filter((use) => use.frame === frame).map((use) => use.original);
				const original = targets[0];
				if (!original) continue;
				try {
					const prior = compiler.publication(original.publication);
					if (!prior || prior.root !== held.root || prior.frame !== frame)
						throw new Error("the affected frame publication is no longer available");
					const inputs = new Map(prior.compilation.inputs);
					if (!inputs.has(held.file)) throw new Error("the affected frame has no source dependency");
					inputs.set(held.file, readInput(held.file));
					valid(held.root, { ...prior.compilation, inputs });
					const next = await compiler.compilePublication(
						held.root,
						frame,
						inputs,
						++sequence,
						prior.compilation.absent,
						prior.compilation,
					);
					if (next.packet.shape !== prior.compilation.packet.shape)
						throw new Error("the affected frame changed executable shape");
					related.push({
						admission,
						owner,
						frame,
						cell: held.read.cell ?? held.read.original.cell,
						targets,
						before: prior.compilation.packet.id,
						packet: next.packet,
						generation: held.read.generation,
						original,
						receipt,
					});
				} catch (error) {
					for (const original of targets)
						failures.push({
							frame,
							occurrence: original.occurrence,
							installation: "refused",
							rendered: "unverified",
							reason: reason(error),
						});
				}
			}
			if (inverse.reach)
				inverse.reach = {
					...inverse.reach,
					uses: inverse.reach.uses.map((use) => {
						const packet =
							use.frame === held.frame
								? retained.packet
								: related.find((item) => item.frame === use.frame)?.packet;
						return packet ? { ...use, original: { ...use.original, publication: packet.id } } : use;
					}),
				};

			return {
				ok: true,
				source: "saved",
				publication: {
					admission,
					related,
					failures,
					targets: uses.filter((use) => use.frame === held.frame).map((use) => use.original),
					owner,
					frame: held.frame,
					...(held.read.cell ? { cell: held.read.cell } : {}),
					before: held.compilation.packet.id,
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

				const op = ops[0];
				if (!op || op.kind !== "set-text") throw new Error("this read only authorizes text");
				if (held.target?.syntax === "react-call")
					return await publish(
						held,
						writeFactoryLiteral(
							source,
							{
								start: held.target.address.start,
								end: held.target.address.end,
								field: held.target.attribute ?? "children",
								value: held.read.value,
							},
							op.text,
						),
					);
				const operation: HandOp = held.read.field
					? { kind: "set-attribute", source: held.read.source, name: held.read.field, value: op.text }
					: op;
				const planned = planOps(source, [operation]);
				if (!planned.ok) throw new Error(planned.refusal.says);
				return await publish(held, planned.text);
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

				valid(root, held.required);
				let frame = held.frame;
				let compilation = held.compilation;
				let original = held.original;
				let reach = held.reach;
				if (lookupFrame(root, frame).kind !== "found") {
					const consumer = reach?.uses.find((use) => lookupFrame(root, use.frame).kind === "found");
					const publication = consumer ? compiler.publication(consumer.original.publication) : undefined;
					if (consumer && publication && publication.root === root) {
						frame = consumer.frame;
						compilation = publication.compilation;
						original = consumer.original;
					}
				}
				if (reach)
					reach = {
						...reach,
						uses: reach.uses.filter((use) => lookupFrame(root, use.frame).kind === "found"),
						unmounted: reach.unmounted.filter((name) => lookupFrame(root, name).kind === "found"),
					};
				held.retired = true;
				const source = held.compilation.inputs.get(held.file)?.bytes.toString("utf8");
				if (source === undefined) throw new Error("the inverse source read is incomplete");
				const cell = held.compilation.cells[held.cell];
				if (!cell) throw new Error("the original source role changed");
				return await publish(
					{
						observer: "",
						root,
						frame,
						file: held.file,
						compilation,
						history: held.required,
						read: {
							handle: "",
							owner,
							original,
							generation: held.generation,
							role: cell.field ? "literal-attribute" : "literal-child",
							cell: held.cell,
							...(reach ? { reach } : {}),
							source: cell.source,
							value: cell.value,
						},
					},
					applySpan(source, held.inverse),
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
			return true;
		} catch {
			return false;
		}
	}
	function admit(token: string): boolean {
		const held = [...deliveries.values()].find((delivery) => delivery.token === token);
		if (!held || Date.now() >= held.expires) return false;
		try {
			valid(held.root, held.compilation);
			return true;
		} catch {
			return false;
		}
	}
	return {
		owner,
		admit,
		read,
		reach,
		commit,
		inverse,
		current,
		delivered,
		cancel: (root: string, handle: string) => {
			if (reads.get(handle)?.root === root) reads.delete(handle);
		},
	};
}
