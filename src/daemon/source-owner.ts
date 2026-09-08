import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative } from "node:path";
import { writeAtomic } from "../atomic-write";
import {
	type SourceChange,
	type SourceDescription,
	type SourceInventory,
	type SourceOccurrence,
	type SourceOperation,
	type SourcePublication,
	type SourceRead,
	type SourceReceipt,
	type SourceResult,
	type SourceUse,
	sameSourceOccurrence,
	sameSourceOperation,
	type UseOutcome,
} from "../source-edit";
import type { SourceImagePut, SourceImageStaged } from "../source-image";
import { ASSET_FILTER } from "./assets";
import type { ExecutedEdit } from "./bundled-editor";
import type { FrameCompiler } from "./compile";
import { assertDesignFile, realDesignDir, resolveDesignPath } from "./design-path";
import type { SourceObservation } from "./events";
import { planFactoryLiteral } from "./factory-literal";
import { identifierHint, specifierFrom } from "./hand-asset";
import { applySpan, type HandOp, planOps, type SpanPatch, spanBetween } from "./hand-write";
import { lookupFrame } from "./projection";
import {
	directoryEntries,
	lowerLiterals,
	type RetainedCompilation,
	readInput,
	type SourceInput,
	sameInput,
} from "./retained-compile";
import type { SourceAgentAuthority, SourceAgentReply, SourceAgentRequest } from "./source-agent";
import { sourceHistoryCompilation } from "./source-history";
import { compileImageChange, compileImageInverse } from "./source-image-plan";
import { type StagedImage, stageImageAsset } from "./source-image-stage";
import { assertImageContext, resolveImageSource } from "./source-image-target";
import { createSourceJournal } from "./source-journal";
import { type Selection, Sources, type Target } from "./source-origins";
import { applySourcePatches } from "./source-patches";
import { retryTextSource } from "./source-retry";
import { readStructuralAncestry } from "./source-structure";
import {
	certifyStructuralChange,
	describeDeleteTarget,
	potentialDeleteSource,
	resolveSourceDelete,
	type SourceDeleteTarget,
} from "./source-structure-target";
import { sourceTarget } from "./source-syntax";
import { potentialTextSource, resolveTextSource } from "./source-target";

interface StructuralParent {
	frame: string;
	occurrence: string;
}
interface OriginalRead {
	inverseExpected?: SourcePublication["expected"];
	imageRestore?: RetainedCompilation;
	image?: StagedImage;
	structuralParents?: StructuralParent[];
	retryFrom?: RetainedCompilation;
	structure?: SourceDeleteTarget;
	sourceOnly?: boolean;
	coverage: number;
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
	imageRestore?: RetainedCompilation;
	structuralAfter?: Extract<SourcePublication["expected"], { kind: "structure" }>;
	structuralParents?: StructuralParent[];
	purpose: SourceRead["operation"];
	structuralRead?: SourceRead;
	structure?: SourceDeleteTarget;
	expected: SourcePublication["expected"];
	required: RetainedCompilation;
	cell: string;
	reach?: SourceRead["reach"];
	operation: symbol;
	coverage: number;
	root: string;
	frame: string;
	file: string;
	compilation: RetainedCompilation;
	inverse: readonly SpanPatch[];
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
	const journal = createSourceJournal();
	const continuity = new Map<string, SourceInput>();
	const stagedAdditions = new Map<string, { root: string; input: SourceInput }>();
	const stagedDirectories = new Map<string, Map<string, Map<string, string>>>();
	function afterStaging(root: string, compilation: RetainedCompilation): RetainedCompilation {
		const transitions = stagedDirectories.get(root);
		if (!transitions) return compilation;
		const directories = new Map(compilation.directories);
		for (const [directory, changes] of transitions) {
			if (compilation.globDiscoveries?.some((group) => group.directories.includes(directory))) continue;
			let entries = directories.get(directory);
			while (entries !== undefined && changes.has(entries)) entries = changes.get(entries);
			if (entries !== undefined) directories.set(directory, entries);
		}
		return { ...compilation, directories };
	}
	function sourcePublication(id: string) {
		const held = compiler.publication(id);
		return held ? { ...held, compilation: afterStaging(held.root, held.compilation) } : undefined;
	}
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
		stagedDirectories.delete(root);
		for (const [file, addition] of stagedAdditions) if (addition.root === root) stagedAdditions.delete(file);
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
					valid(root, "required" in held ? held.required : held.compilation);
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
	const deliveryGroups = new Map<string, string[]>();
	function delivered(publication: string): void {
		const children = deliveryGroups.get(publication);
		deliveryGroups.delete(publication);
		for (const child of children ?? []) delivered(child);
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
		for (const [path, entries] of afterStaging(root, compilation).directories)
			if (directoryEntries(path) !== entries) {
				for (const receipt of receipts.values()) if (receipt.required.directories.has(path)) receipt.retired = true;
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
	async function currentCompilation(root: string, frame: string, compilation: RetainedCompilation) {
		compilation = afterStaging(root, compilation);
		const inputs = new Map([...compilation.inputs].map(([file, input]) => [file, journal.current(file, input)]));
		const current = await compiler.compilePublication(root, frame, inputs, sequence, compilation.absent, compilation);
		valid(root, current);
		return current;
	}

	async function read(
		root: string,
		frame: string,
		original: SourceOccurrence,
		generation: number,
		observer: string,
		operation: SourceOperation = { kind: "literal", ...(original.field ? { field: original.field } : {}) },
		retry = false,
	): Promise<{ ok: true; read: SourceRead } | { ok: false; reason: string }> {
		try {
			watch(root);
			const readingCoverage = coverage.get(root) ?? 0;
			const observed = await observe(root, frame, generation, observer);
			if (!observed || !sameSourceOccurrence(observed, original))
				throw new Error("the original committed occurrence is no longer eligible");
			const publication = sourcePublication(original.publication);
			if (!publication || publication.root !== root || publication.frame !== frame)
				throw new Error("the original source owner is no longer available");
			let { compilation } = publication;
			if (readingCoverage !== (coverage.get(root) ?? 0))
				throw new Error("source observation changed during the original read");
			valid(root, compilation);

			if (operation.kind === "delete") {
				const structure = resolveSourceDelete(root, compilation, original, generation);
				const read: SourceRead = {
					...describeDeleteTarget(original, structure),
					handle: randomUUID(),
					owner,
					generation,
				};
				reads.set(read.handle, {
					structure,
					coverage: readingCoverage,
					root,
					frame,
					read,
					compilation,
					file: structure.file,
					observer,
				});
				return { ok: true, read };
			}
			if (operation.kind !== "literal" && operation.kind !== "image")
				throw new Error("this source operation has no admitted planner");
			if (operation.kind === "literal" && operation.field !== original.field)
				throw new Error("the source purpose does not match the original field");
			if (operation.kind === "image" && retry)
				throw new Error("read the current image binding before trying this replacement again");
			const retryFrom = retry ? compilation : undefined;
			let resolved =
				operation.kind === "image"
					? resolveImageSource(root, compilation, original, generation)
					: resolveTextSource(root, compilation, original, generation);
			if (retry) {
				const current = await currentCompilation(root, frame, compilation);
				if (readingCoverage !== (coverage.get(root) ?? 0))
					throw new Error("source observation changed during retry");
				resolved = retryTextSource(root, compilation, current, original, generation);
				compilation = current;
			}
			const { cellKey, cell, target } = resolved;
			const found = lookupFrame(root, frame);
			if (found.kind !== "found") throw new Error("the original frame is no longer there");
			const file = sourceTarget(root, cell.file, compilation.inputs).file;
			const handle = randomUUID();
			const read: SourceRead = {
				operation,
				...(target?.asset ? { asset: target.asset.path } : {}),
				handle,
				owner,
				original: { ...original },
				generation,
				source: cell.source,
				role:
					operation.kind === "image"
						? "image-binding"
						: target?.syntax === "react-call"
							? "factory-literal"
							: cell.field
								? "literal-attribute"
								: "literal-child",
				cell: cellKey,
				...(cell?.field ? { field: cell.field } : {}),
				scope: target?.role ?? "definition",
				repeated: target?.repeated ?? false,
				value: cell.value,
			};
			reads.set(handle, {
				...(retryFrom ? { retryFrom } : {}),
				coverage: readingCoverage,
				root,
				frame,
				read,
				compilation,
				file,
				observer,
				...(target ? { target } : {}),
			});
			return { ok: true, read };
		} catch (error) {
			return { ok: false, reason: reason(error) };
		}
	}
	function stageImage(
		root: string,
		handle: string,
		generation: number,
		original: SourceOccurrence,
		put: SourceImagePut,
	): Promise<SourceImageStaged> {
		return ordered(root, async () => {
			try {
				const held = reads.get(handle);
				if (
					!held ||
					held.root !== root ||
					held.read.operation.kind !== "image" ||
					held.read.generation !== generation ||
					!sameSourceOccurrence(held.read.original, original)
				)
					throw new Error("the original image edit is no longer eligible");
				const observed = await observe(root, held.frame, generation, held.observer);
				if (reads.get(handle) !== held || !observed || !sameSourceOccurrence(observed, original))
					throw new Error("the original image changed before staging");
				valid(root, held.compilation);
				if (held.coverage !== (coverage.get(root) ?? 0))
					throw new Error("source observation was lost before staging");
				const found = lookupFrame(root, held.frame);
				if (found.kind !== "found") throw new Error("the original image frame is no longer available");
				const image = stageImageAsset(root, found.dir, put, (file) => {
					const compilations = [
						held.compilation,
						...(held.read.reach?.uses ?? []).flatMap((use) => {
							const known = sourcePublication(use.original.publication);
							return known ? [known.compilation] : [];
						}),
					];
					if (
						compilations.some((compilation) =>
							compilation.globDiscoveries?.some((group) => group.directories.includes(dirname(file))),
						)
					)
						throw new Error("the new image could change an original computed import inventory");
				});
				if (image.created) {
					const directories = new Map(held.compilation.directories);
					const before = directories.get(image.created.directory);
					if (before !== undefined && before !== image.created.before)
						throw new Error("the original image directory changed");
					if (before !== undefined) directories.set(image.created.directory, image.created.after);
					held.compilation = { ...held.compilation, directories };
				}
				valid(root, held.compilation);
				held.image = image;
				if (image.created) {
					stagedAdditions.set(image.file, { root, input: image.input });
					const directories = stagedDirectories.get(root) ?? new Map<string, Map<string, string>>();
					const changes = directories.get(image.created.directory) ?? new Map<string, string>();
					changes.set(image.created.before, image.created.after);
					directories.set(image.created.directory, changes);
					stagedDirectories.set(root, directories);
				}
				return { ok: true, path: image.path, value: image.value };
			} catch (error) {
				return { ok: false, reason: reason(error) };
			}
		});
	}
	/** The watcher still observes source; only this unchanged new-file event owes no frame reload. */
	function stagedAddition(root: string, file: string): (() => void) | undefined {
		const held = stagedAdditions.get(file);
		if (!held || held.root !== root) return undefined;
		try {
			assertDesignFile(realDesignDir(root), file);
			if (!sameInput(held.input, readInput(file))) throw new Error("the staged addition changed");
			return () => {
				if (stagedAdditions.get(file) === held) stagedAdditions.delete(file);
			};
		} catch {
			stagedAdditions.delete(file);
			return undefined;
		}
	}

	async function reach(root: string, handle: string, inventories: SourceInventory[]) {
		const held = reads.get(handle);
		if (!held || held.root !== root)
			return { ok: false as const, reason: "the original source read is no longer available" };
		return discover(root, held, inventories);
	}
	async function describe(
		root: string,
		frame: string,
		original: SourceOccurrence,
		inventories: SourceInventory[],
		operation: SourceOperation = { kind: "literal", ...(original.field ? { field: original.field } : {}) },
	): Promise<{ ok: true; description: SourceDescription } | { ok: false; reason: string }> {
		try {
			const publication = sourcePublication(original.publication);
			if (!publication || publication.root !== root || publication.frame !== frame)
				throw new Error("the source owner is no longer available");
			valid(root, publication.compilation);
			if (operation.kind === "delete") {
				const structure = resolveSourceDelete(root, publication.compilation, original, 0);
				const read: SourceRead = { ...describeDeleteTarget(original, structure), handle: "", owner, generation: 0 };
				const found = await discover(
					root,
					{
						structure,
						root,
						frame,
						read,
						compilation: publication.compilation,
						file: structure.file,
						observer: "",
						coverage: coverage.get(root) ?? 0,
					},
					inventories,
				);
				if (!found.ok) return found;
				const { handle: _handle, owner: _owner, generation: _generation, ...description } = found.read;
				return { ok: true, description };
			}
			if (operation.kind !== "literal" && operation.kind !== "image")
				throw new Error("this source purpose has no admitted description planner");
			const { cellKey, cell, target } =
				operation.kind === "image"
					? resolveImageSource(root, publication.compilation, original, 0)
					: resolveTextSource(root, publication.compilation, original, 0);
			const read: SourceRead = {
				operation,
				...(target?.asset ? { asset: target.asset.path } : {}),
				handle: "",
				owner,
				generation: 0,
				original,
				source: cell.source,
				cell: cellKey,
				value: cell.value,
				role: cell.image
					? "image-binding"
					: target?.syntax === "react-call"
						? "factory-literal"
						: cell.field
							? "literal-attribute"
							: "literal-child",
				scope: target?.role ?? "definition",
				repeated: target?.repeated ?? false,
				...(cell?.field ? { field: cell.field } : {}),
			};
			const found = await discover(
				root,
				{
					root,
					frame,
					read,
					compilation: publication.compilation,
					file: sourceTarget(root, cell.file, publication.compilation.inputs).file,
					observer: "",
					coverage: coverage.get(root) ?? 0,
				},
				inventories,
			);
			if (!found.ok) return found;
			const { handle: _handle, owner: _owner, generation: _generation, ...description } = found.read;
			return { ok: true, description };
		} catch (error) {
			return { ok: false, reason: reason(error) };
		}
	}
	/** Both fresh reads and receipt-owned inverses inspect the same frozen inventories. */
	function observedUses(
		root: string,
		cell: string,
		generation: number,
		inventories: SourceInventory[],
		mode: "read" | "inverse",
	) {
		const uses: SourceUse[] = [];
		const unverified: UseOutcome[] = [];
		const unknown = new Set<string>();
		const refuse = (frame: string, occurrence: string, says: string) =>
			unverified.push({
				frame,
				occurrence,
				installation: "refused",
				rendered: "unverified",
				reason: says,
			});
		for (const inventory of inventories) {
			const publication = sourcePublication(inventory.publication);
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
					// A stale candidate can establish uncertainty, never a current occurrence.
					// Unrelated uninspectable leaves remain coverage, not attributed failures.
					if (potentialTextSource(publication.compilation, use.original, cell))
						refuse(
							inventory.frame,
							"",
							"A potentially affected use belongs to another publication; its current coverage is unverified.",
						);
					continue;
				}
				try {
					// Only a receipt-owned inverse may resolve a retained old rendered value
					// against this exact cell. Ordinary reads retain literal equality checks.
					const resolveSource = publication.compilation.cells[cell]?.image
						? resolveImageSource
						: resolveTextSource;
					const target = resolveSource(
						root,
						publication.compilation,
						use.original,
						generation,
						mode === "inverse" ? cell : undefined,
					);
					if (
						target.cellKey === cell &&
						!uses.some(
							(other) =>
								other.frame === inventory.frame && other.original.occurrence === use.original.occurrence,
						)
					)
						uses.push({ frame: inventory.frame, ...use });
				} catch (error) {
					unknown.add(inventory.frame);
					if (potentialTextSource(publication.compilation, use.original, cell))
						refuse(
							inventory.frame,
							use.original.occurrence,
							`A potentially affected use could not be attributed: ${reason(error)}`,
						);
				}
			}
		}
		return { uses, unverified, unknown };
	}

	function structuralUses(
		root: string,
		target: SourceDeleteTarget,
		compilation: RetainedCompilation,
		generation: number,
		inventories: SourceInventory[],
	) {
		const input = compilation.inputs.get(target.file);
		if (!input) throw new Error("the structural target is outside its original compiler input");
		const [selected] = journal.transform(target.file, input, [{ ...target.selected, text: target.replacement }]);
		if (!selected) throw new Error("the original structural span is missing");
		const uses: SourceUse[] = [],
			unverified: UseOutcome[] = [];
		const unknown = new Set<string>();
		for (const inventory of inventories) {
			if (inventory.unknown) unknown.add(inventory.frame);
			const publication = compiler.publication(inventory.publication);
			if (!publication || publication.root !== root || publication.frame !== inventory.frame) {
				unknown.add(inventory.frame);
				continue;
			}
			for (const use of inventory.uses) {
				if (!use.original.structure) continue;
				const current = use.original.publication === inventory.publication;
				try {
					if (!current) throw new Error("the candidate belongs to another publication");
					valid(root, publication.compilation);
					const candidate = resolveSourceDelete(root, publication.compilation, use.original, generation);
					if (candidate.file !== target.file || candidate.site !== target.site) continue;
					const candidateInput = publication.compilation.inputs.get(candidate.file);
					if (!candidateInput) throw new Error("the structural use is outside its original compiler input");
					const [candidateSpan] = journal.transform(candidate.file, candidateInput, [
						{ ...candidate.selected, text: candidate.replacement },
					]);
					if (candidateSpan?.start === selected.start && candidateSpan.end === selected.end)
						uses.push({ frame: inventory.frame, ...use });
				} catch (error) {
					unknown.add(inventory.frame);
					if (potentialDeleteSource(use.original, target.source))
						unverified.push({
							frame: inventory.frame,
							occurrence: current ? use.original.occurrence : "",
							installation: "refused",
							rendered: "unverified",
							reason: `A potentially affected structural use could not be attributed: ${reason(error)}`,
						});
				}
			}
		}
		return { uses, unverified, unknown };
	}

	function structuralInverseUses(root: string, held: Receipt, inventories: SourceInventory[]) {
		const uses: SourceUse[] = [],
			unverified: UseOutcome[] = [];
		const unknown = new Set<string>();
		const prior = held.structuralParents ?? [];
		for (const inventory of inventories) {
			if (inventory.unknown) unknown.add(inventory.frame);
			const publication = compiler.publication(inventory.publication);
			if (!publication || publication.root !== root || publication.frame !== inventory.frame) {
				unknown.add(inventory.frame);
				continue;
			}
			const parents = new Set(prior.filter((use) => use.frame === inventory.frame).map((use) => use.occurrence));
			for (const use of inventory.uses) {
				if (!parents.has(use.original.occurrence)) continue;
				try {
					if (!use.original.provenance)
						throw new Error("the original structural parent has no committed provenance");
					const sources = new Sources(root, publication.compilation);
					for (const file of publication.compilation.inputs.keys())
						if (/\.[cm]?[jt]sx?$/.test(file)) sources.read(relative(realDesignDir(root), file));
					readStructuralAncestry(sources, JSON.parse(use.original.provenance) as Selection);
					uses.push({ frame: inventory.frame, ...use });
				} catch (error) {
					unverified.push({
						frame: inventory.frame,
						occurrence: use.original.occurrence,
						installation: "refused",
						rendered: "unverified",
						reason: reason(error),
					});
				}
			}
		}
		return { uses, unverified, unknown };
	}

	async function discover(
		root: string,
		held: OriginalRead,
		inventories: SourceInventory[],
	): Promise<{ ok: true; read: SourceRead } | { ok: false; reason: string }> {
		try {
			valid(root, held.compilation);
			const cell = held.read.cell ?? held.read.original.cell;
			const { uses, unverified, unknown } = held.structure
				? structuralUses(root, held.structure, held.compilation, held.read.generation, inventories)
				: observedUses(root, cell, held.read.generation, inventories, "read");
			const mounted = new Set(inventories.map((inventory) => inventory.frame));
			const dependent = await dependencyFrames(root, held.file);
			if (!dependent) unknown.add("source coverage");
			const unmounted = (dependent ?? []).filter((frame) => !mounted.has(frame));
			held.read = { ...held.read, reach: { uses, unmounted, unknown: [...unknown], unverified } };
			return { ok: true, read: held.read };
		} catch (error) {
			return { ok: false, reason: reason(error) };
		}
	}

	async function publish(
		held: OriginalRead,
		next: string,
		expected: SourcePublication["expected"],
		executed?: readonly SpanPatch[],
		inverseOf?: symbol,
	): Promise<SourceResult> {
		held = {
			...held,
			compilation: afterStaging(held.root, held.compilation),
			...(held.history ? { history: afterStaging(held.root, held.history) } : {}),
			...(held.imageRestore ? { imageRestore: afterStaging(held.root, held.imageRestore) } : {}),
		};
		valid(held.root, held.history ?? held.compilation);
		if (held.coverage !== (coverage.get(held.root) ?? 0))
			throw new Error("source observation was lost before saving");
		const rebased = new Map(
			[...held.compilation.inputs].map(([file, input]) => [file, journal.current(file, input)]),
		);
		if (held.sourceOnly) {
			for (const [file, input] of rebased)
				if (/\.[cm]?[jt]sx?$/.test(file)) {
					const path = relative(realDesignDir(held.root), file);
					if (lowerLiterals(path, input.bytes.toString("utf8")).shape !== held.compilation.shapes[path])
						throw new Error("the source role or executable context changed before saving");
				}
		} else if ([...rebased].some(([file, input]) => !sameInput(input, held.compilation.inputs.get(file)!))) {
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
		let imageSnapshot: RetainedCompilation | undefined;
		const imageRelated = new Map<string, RetainedCompilation>();
		if (expected.kind === "image") {
			const current = { ...held.compilation, inputs: rebased };
			imageSnapshot = held.imageRestore
				? await compileImageInverse(
						compiler,
						held.root,
						held.frame,
						current,
						held.file,
						next,
						held.imageRestore,
						held.sourceOnly,
					)
				: held.image
					? await compileImageChange(compiler, held.root, held.frame, current, held.file, next, held.image)
					: undefined;
			if (!imageSnapshot) throw new Error("the original image staging evidence is missing");
			const key = held.read.cell ?? held.read.original.cell;
			const image = imageSnapshot.cells[key];
			if (!image?.image || image.value !== expected.value || (image.absent === true) !== expected.absent)
				throw new Error("the planned image no longer resolves to its requested source value");
			if (held.imageRestore && JSON.stringify(image.image) !== JSON.stringify(held.imageRestore.cells[key]?.image))
				throw new Error("the original inverse image import binding changed");
			for (const use of held.read.reach?.uses ?? []) {
				if (use.frame === held.frame || imageRelated.has(use.frame)) continue;
				const prior = sourcePublication(use.original.publication);
				if (!prior || prior.root !== held.root || prior.frame !== use.frame)
					throw new Error("an affected image publication is no longer available");
				valid(held.root, prior.compilation);
				const inputs = new Map(
					[...prior.compilation.inputs].map(([file, input]) => [file, journal.current(file, input)]),
				);
				const current = { ...prior.compilation, inputs };
				const prospective = held.imageRestore
					? await compileImageInverse(compiler, held.root, use.frame, current, held.file, next, held.imageRestore)
					: held.image
						? await compileImageChange(compiler, held.root, use.frame, current, held.file, next, held.image)
						: undefined;
				if (
					!prospective ||
					prospective.cells[key]?.value !== expected.value ||
					(prospective.cells[key]?.absent === true) !== expected.absent
				)
					throw new Error("an affected image no longer resolves to the requested source value");
				valid(held.root, prior.compilation);
				imageRelated.set(use.frame, prospective);
			}
			valid(held.root, held.history ?? held.compilation);
			for (const [path, input] of held.compilation.inputs)
				if (ASSET_FILTER.test(path) && !sameInput(input, readInput(path)))
					throw new Error("the original image dependency bytes changed before saving");
			if (held.image && !sameInput(held.image.input, readInput(held.image.file)))
				throw new Error("the staged image bytes changed before saving");
			if (held.coverage !== (coverage.get(held.root) ?? 0))
				throw new Error("source observation was lost before saving");
		}
		let structureBefore = held.read.structure;
		if (held.structure && expected.kind === "structure") {
			if (!structureBefore) throw new Error("the original structural parent guard is missing");
			const certified = certifyStructuralChange(held.structure, before, next, structureBefore);
			structureBefore = {
				...structureBefore,
				state: certified.before,
				...(held.structure.expected.fallback && certified.before.optional[held.structure.site] === false
					? { fallback: held.structure.expected.fallback }
					: {}),
			};
			expected = {
				...expected,
				state: certified.after,
				...(held.structure.expected.fallback && certified.after.optional[held.structure.site] === false
					? { fallback: held.structure.expected.fallback }
					: {}),
			};
		}

		const compatibleBefore = compiler.matchingPublications(
			held.root,
			held.frame,
			rebased,
			held.compilation.packet.shape,
		);
		if (next === before) return { ok: true, source: "unchanged", publication: null };
		const frozen = new Map(
			[...(imageSnapshot ?? held.compilation).inputs].map(([file, captured]) => [
				file,
				file === held.file ? input : journal.current(file, captured),
			]),
		);
		// Source remains ordinary files. This final synchronous check and rename
		// cannot exclude an uncoordinated process saving after the check.
		const forward = applySourcePatches(before, executed ?? [spanBetween(next, before)]);
		if (forward.text !== next) throw new Error("the source operation does not match its planned spans");
		writeAtomic(held.file, next);
		const after = readInput(held.file);
		const operation = journal.record(
			held.file,
			input,
			after,
			forward.patches.map((patch) => ({ ...patch, before: before.slice(patch.start, patch.end) })),
			inverseOf,
		);
		frozen.set(held.file, after);
		for (const [file, input] of frozen) continuity.set(file, input);
		const receipt: SourceReceipt = {
			operation: held.read.operation,
			owner,
			handle: randomUUID(),
			...(held.read.original.field ? { field: held.read.original.field } : {}),
		};
		const saved = { ...(imageSnapshot ?? held.compilation), inputs: frozen };
		const inverse: Receipt = {
			...(expected.kind === "structure" ? { structuralAfter: expected } : {}),
			purpose: held.read.operation,
			...(expected.kind === "image" ? { imageRestore: held.compilation } : {}),
			...(held.structure
				? {
						structure: held.structure,
						structuralRead: held.read,
						structuralParents:
							held.structuralParents ??
							(held.read.reach?.uses ?? [{ frame: held.frame, original: held.read.original }]).flatMap((use) =>
								use.original.structure ? [{ frame: use.frame, occurrence: use.original.structure.parent }] : [],
							),
					}
				: {}),
			expected: held.inverseExpected ??
				structureBefore ?? {
					kind: "literal",
					value: held.compilation.cells[held.read.cell ?? held.read.original.cell]?.value ?? held.read.value,
					absent: held.compilation.cells[held.read.cell ?? held.read.original.cell]?.absent === true,
				},
			required: sourceHistoryCompilation(held.root, saved, held.file),
			cell: held.read.cell ?? held.read.original.cell,
			...(held.read.reach ? { reach: held.read.reach } : {}),
			operation,
			coverage: held.coverage,
			root: held.root,
			frame: held.frame,
			file: held.file,
			compilation: saved,
			inverse: forward.inverse,
			original: held.read.original,
			generation: held.read.generation,
			retired: false,
		};
		receipts.set(receipt.handle, inverse);
		if (held.sourceOnly) {
			const cells: RetainedCompilation["cells"] = imageSnapshot?.cells ?? {};
			if (!imageSnapshot)
				for (const [file, input] of frozen)
					if (/\.[cm]?[jt]sx?$/.test(file))
						Object.assign(
							cells,
							lowerLiterals(relative(realDesignDir(held.root), file), input.bytes.toString("utf8")).cells,
						);
			inverse.compilation = { ...saved, cells };
			inverse.required = sourceHistoryCompilation(held.root, inverse.compilation, held.file);
			return {
				ok: true,
				source: "saved",
				publication: null,
				receipt,
				reason: "Source saved; no mounted affected use was available to verify.",
			};
		}
		try {
			const retained = await compiler.compilePublication(
				held.root,
				held.frame,
				frozen,
				++sequence,
				(imageSnapshot ?? held.compilation).absent,
				imageSnapshot ?? held.compilation,
			);
			if (held.coverage !== (coverage.get(held.root) ?? 0))
				throw new Error("source observation was lost after saving");
			if (retained.packet.shape !== held.compilation.packet.shape)
				throw new Error("saved source has a different executable shape");
			inverse.compilation = retained;
			inverse.required = sourceHistoryCompilation(held.root, retained, held.file);
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
			const failures: UseOutcome[] = [...(held.read.reach?.unverified ?? [])];
			const uses = held.read.reach?.uses ?? [];
			for (const frame of new Set(uses.map((use) => use.frame))) {
				if (frame === held.frame) continue;
				const targets = uses.filter((use) => use.frame === frame).map((use) => use.original);
				const original = targets[0];
				if (!original) continue;
				try {
					const prior = sourcePublication(original.publication);
					if (!prior || prior.root !== held.root || prior.frame !== frame)
						throw new Error("the affected frame publication is no longer available");
					const image = imageRelated.get(frame);
					const inputs = new Map(
						[...(image ?? prior.compilation).inputs].map(([file, input]) => [
							file,
							file === held.file ? after : journal.current(file, input),
						]),
					);
					if (!inputs.has(held.file)) throw new Error("the affected frame has no source dependency");
					const compatibleInputs = new Map(inputs);
					compatibleInputs.set(held.file, input);
					const compatibleBefore = compiler.matchingPublications(
						held.root,
						frame,
						compatibleInputs,
						prior.compilation.packet.shape,
					);
					valid(held.root, { ...(image ?? prior.compilation), inputs });
					const next = await compiler.compilePublication(
						held.root,
						frame,
						inputs,
						++sequence,
						(image ?? prior.compilation).absent,
						image ?? prior.compilation,
					);
					if (next.packet.shape !== prior.compilation.packet.shape)
						throw new Error("the affected frame changed executable shape");
					const secondaryAdmission = { token: randomUUID(), expires: admission.expires };
					const secondaryTimer = setTimeout(
						() => delivered(next.packet.id),
						Math.max(0, admission.expires - Date.now()),
					);
					secondaryTimer.unref();
					deliveries.set(next.packet.id, {
						...secondaryAdmission,
						root: held.root,
						compilation: next,
						release: () => {},
						done: Promise.resolve(),
						timer: secondaryTimer,
					});
					deliveryGroups.set(retained.packet.id, [
						...(deliveryGroups.get(retained.packet.id) ?? []),
						next.packet.id,
					]);
					related.push({
						expected,
						admission: secondaryAdmission,
						owner,
						frame,
						cell: held.read.cell ?? held.read.original.cell,
						targets,
						before: prior.compilation.packet.id,
						compatibleBefore,
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
					expected,
					admission,
					related,
					failures,
					targets: uses.filter((use) => use.frame === held.frame).map((use) => use.original),
					owner,
					frame: held.frame,
					...(held.read.cell ? { cell: held.read.cell } : {}),
					before: held.read.original.publication,
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
		change: SourceChange,
	): Promise<SourceResult> {
		return ordered(root, async () => {
			const held = reads.get(handle);
			reads.delete(handle); // exactly one completion, including a failed or unknown attempt
			let authenticated = false;
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
				if (held.retryFrom) {
					const current = await currentCompilation(root, held.frame, held.compilation);
					retryTextSource(root, held.retryFrom, current, held.read.original, generation);
				}
				if (change.kind !== held.read.operation.kind)
					throw new Error("this source read does not authorize that operation");
				authenticated = true;
				if (held.structure) {
					if (change.kind !== "delete") throw new Error("this structural read does not authorize that operation");
					const target = held.structure;
					const input = held.compilation.inputs.get(held.file);
					if (!input) throw new Error("the original structural source input is missing");
					const transformed = journal.transform(held.file, input, [
						{ ...target.selected, text: target.replacement },
					]);
					return await publish(
						held,
						applySourcePatches(journal.current(held.file, input).bytes.toString("utf8"), transformed).text,
						target.expected,
						transformed,
					);
				}
				const source = held.compilation.inputs.get(held.file)?.bytes.toString("utf8");
				if (source === undefined) throw new Error("the original source read is incomplete");

				if (change.kind === "image") {
					held.compilation = afterStaging(root, held.compilation);
					const inputs = new Map(
						[...held.compilation.inputs].map(([path, input]) => [path, journal.current(path, input)]),
					);
					const current = await compiler.compileSnapshot(
						root,
						held.frame,
						inputs,
						sequence,
						held.compilation.absent,
						held.compilation,
					);
					valid(root, current);
					assertImageContext(held.compilation, current, original, held.read.cell ?? original.cell);
					if (!held.image || held.image.path !== change.path)
						throw new Error("the chosen image was not staged by this read");
					if (!sameInput(held.image.input, readInput(held.image.file)))
						throw new Error("the staged image bytes changed");
					if (held.coverage !== (coverage.get(root) ?? 0))
						throw new Error("source observation was lost before saving");
					if (held.target?.asset?.file === held.image.file)
						return { ok: true, source: "unchanged", publication: null };
					const planned = planOps(source, [
						{
							kind: "set-asset",
							source: held.read.source,
							specifier: specifierFrom(held.file, held.image.file),
							hint: identifierHint(basename(held.image.file)),
						},
					]);
					if (!planned.ok) throw new Error(planned.refusal.says);
					const input = held.compilation.inputs.get(held.file);
					if (!input) throw new Error("the original image source input is missing");
					const patches = journal.transform(held.file, input, planned.patches);
					const cell = held.compilation.cells[held.read.cell ?? held.read.original.cell];
					if (!cell?.image) throw new Error("the original image binding is missing");
					return await publish(
						{ ...held, inverseExpected: { kind: "image", value: cell.value, absent: cell.absent === true } },
						applySourcePatches(journal.current(held.file, input).bytes.toString("utf8"), patches).text,
						{ kind: "image", value: held.image.value, absent: false },
						patches,
					);
				}

				if (change.kind !== "literal") throw new Error("this read only authorizes literal values");
				let patches: readonly SpanPatch[];
				if (held.target?.syntax === "react-call")
					patches = [
						planFactoryLiteral(
							source,
							{
								start: held.target.address.start,
								end: held.target.address.end,
								field: held.target.attribute ?? "children",
								value: held.read.value,
							},
							change.text,
						),
					];
				else {
					const operation: HandOp = held.read.field
						? { kind: "set-attribute", source: held.read.source, name: held.read.field, value: change.text }
						: { kind: "set-text", source: held.read.source, text: change.text };
					const planned = planOps(source, [operation]);
					if (!planned.ok) throw new Error(planned.refusal.says);
					patches = planned.patches;
				}
				const input = held.compilation.inputs.get(held.file);
				if (!input) throw new Error("the original source input is missing");
				const transformed = journal.transform(held.file, input, patches);
				if (transformed.length === 0) throw new Error("the source patch is missing");
				return await publish(
					held,
					applySourcePatches(journal.current(held.file, input).bytes.toString("utf8"), transformed).text,
					{ kind: "literal", value: change.text, absent: false },
					transformed,
				);
			} catch (error) {
				// Read-only conflict evidence uses the original authenticated owner. It
				// neither revives this consumed read nor grants authority for a retry.
				let current: SourceChange | undefined;
				if (authenticated && held?.read.operation.kind === "literal") {
					try {
						valid(root, held.compilation);
						const snapshot = await currentCompilation(root, held.frame, held.compilation);
						const resolved = retryTextSource(
							root,
							held.retryFrom ?? held.compilation,
							snapshot,
							held.read.original,
							generation,
						);
						if (held.coverage === (coverage.get(root) ?? 0))
							current = { kind: "literal", text: resolved.cell.value };
					} catch {
						// Lost continuity or changed ancestry is not a checked current value.
					}
				}
				return { ok: false, reason: reason(error), ...(current ? { current } : {}) };
			}
		});
	}
	function inverse(root: string, receipt: SourceReceipt, inventories?: SourceInventory[]): Promise<SourceResult> {
		return ordered(root, async () => {
			const held = receipts.get(receipt.handle);
			try {
				if (
					receipt.owner !== owner ||
					!held ||
					held.root !== root ||
					held.retired ||
					!sameSourceOperation(receipt.operation, held.purpose)
				)
					throw new Error("this source undo is no longer available");

				valid(root, held.required);
				let frame = held.frame;
				let compilation = afterStaging(root, held.compilation);
				let original = held.original;
				let reach = held.reach;
				if (inventories) {
					const { uses, unverified, unknown } = held.structure
						? structuralInverseUses(root, held, inventories)
						: observedUses(root, held.cell, held.generation, inventories, "inverse");
					const dependent = await dependencyFrames(root, held.file);
					reach = {
						uses,
						unverified,
						unmounted: (dependent ?? []).filter(
							(frame) => !inventories.some((inventory) => inventory.frame === frame),
						),
						unknown: dependent ? [...unknown] : [...unknown, "source coverage"],
					};
					const consumer = uses.find((use) => use.frame === held.frame) ?? uses[0];
					const publication = consumer ? sourcePublication(consumer.original.publication) : undefined;
					if (consumer && publication) {
						frame = consumer.frame;
						compilation = publication.compilation;
						original = consumer.original;
					}
				}
				if (lookupFrame(root, frame).kind !== "found") {
					const consumer = reach?.uses.find((use) => lookupFrame(root, use.frame).kind === "found");
					const publication = consumer ? sourcePublication(consumer.original.publication) : undefined;
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
				const sourceOnly =
					lookupFrame(root, frame).kind !== "found" || (inventories !== undefined && reach?.uses.length === 0);
				if (sourceOnly) compilation = held.required;
				held.retired = true;
				const source = held.compilation.inputs.get(held.file)?.bytes.toString("utf8");
				if (source === undefined) throw new Error("the inverse source read is incomplete");
				const input = held.compilation.inputs.get(held.file);
				if (!input) throw new Error("the original input is missing");
				const transformed = journal.transform(held.file, input, held.inverse);
				if (transformed.length === 0) throw new Error("the inverse source span is missing");
				const cell = held.compilation.cells[held.cell];
				if (!cell && !held.structure) throw new Error("the original source role changed");
				return await publish(
					{
						observer: "",
						...(held.imageRestore
							? {
									imageRestore: held.imageRestore,
									inverseExpected: {
										kind: "image" as const,
										value: cell!.value,
										absent: cell!.absent === true,
									},
								}
							: {}),
						...(held.structure
							? {
									structure: held.structure,
									...(held.structuralParents ? { structuralParents: held.structuralParents } : {}),
								}
							: {}),
						sourceOnly,
						coverage: held.coverage,
						root,
						frame,
						file: held.file,
						compilation,
						history: held.required,
						read:
							held.structuralRead && held.structure
								? {
										...held.structuralRead,
										operation: held.purpose,
										original,
										...(reach ? { reach } : {}),
										...(held.structuralAfter ? { structure: held.structuralAfter } : {}),
									}
								: {
										operation: held.purpose,
										handle: "",
										owner,
										original,
										generation: held.generation,
										role: cell?.image ? "image-binding" : cell?.field ? "literal-attribute" : "literal-child",
										cell: held.cell,
										...(reach ? { reach } : {}),
										source: cell!.source,
										value: cell!.value,
									},
					},
					applySourcePatches(journal.current(held.file, input).bytes.toString("utf8"), transformed).text,
					held.expected,
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
		const held = sourcePublication(publication);
		if (!held || held.root !== root) return false;
		try {
			valid(root, held.compilation);
			return [...held.compilation.inputs].every(([file, input]) =>
				journal.current(file, input).bytes.equals(input.bytes),
			);
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
			stagedAdditions.clear();
			for (const root of revocations.keys()) for (const revoke of revocations.get(root) ?? []) revoke();
			for (const root of new Set([...watching.keys(), ...losses.keys()])) retire(root);
			for (const stop of watching.values()) stop();
			watching.clear();
		},
		admit,
		read,
		stageImage,
		stagedAddition,
		reach,
		describe,
		commit,
		inverse,
		current,
		delivered,
		cancel: (root: string, handle: string) => {
			if (reads.get(handle)?.root === root) reads.delete(handle);
		},
	};
}
