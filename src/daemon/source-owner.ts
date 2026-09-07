import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { writeAtomic } from "../atomic-write";
import {
	type SourceOccurrence,
	type SourceRead,
	type SourceReceipt,
	type SourceResult,
	sameSourceOccurrence,
} from "../source-edit";
import type { FrameCompiler } from "./compile";
import { assertDesignFile, realDesignDir, resolveDesignPath } from "./design-path";
import { applySpan, type HandOp, planOps, type SpanPatch, spanBetween } from "./hand-write";
import { lookupFrame } from "./projection";
import { directoryEntries, type RetainedCompilation, readInput, type SourceInput, sameInput } from "./retained-compile";

interface OriginalRead {
	observer: string;
	root: string;
	frame: string;
	read: SourceRead;
	compilation: RetainedCompilation;
	file: string;
}
interface Receipt {
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
				for (const receipt of receipts.values())
					if (receipt.compilation.directories.has(path)) receipt.retired = true;
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
				for (const receipt of receipts.values()) if (receipt.compilation.inputs.has(file)) receipt.retired = true;
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
			reads.set(handle, { root, frame, read, compilation, file, observer });
			return { ok: true, read };
		} catch (error) {
			return { ok: false, reason: reason(error) };
		}
	}
	async function publish(held: OriginalRead, next: string): Promise<SourceResult> {
		valid(held.root, held.compilation);
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
			// A coordinated inverse can restore an earlier receipt's complete input
			// bytes. Advance that live receipt to this publication and file identity.
			for (const receipt of receipts.values()) {
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
			return {
				ok: true,
				source: "saved",
				publication: {
					admission,
					owner,
					frame: held.frame,
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
				const planned = planOps(source, ops);
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
				valid(root, held.compilation);
				held.retired = true;
				const source = held.compilation.inputs.get(held.file)?.bytes.toString("utf8");
				if (source === undefined) throw new Error("the inverse source read is incomplete");
				const cell = held.compilation.cells[held.original.cell];
				if (!cell) throw new Error("the original source role changed");
				return await publish(
					{
						observer: "",
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
		commit,
		inverse,
		current,
		delivered,
		cancel: (root: string, handle: string) => {
			if (reads.get(handle)?.root === root) reads.delete(handle);
		},
	};
}
