import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative } from "node:path";
import { writeAtomic } from "../atomic-write";
import {
	isPropertyOperation,
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
import type {
	SourcePropertyEffect,
	SourcePropertyEnvironment,
	SourcePropertyPreview,
	SourcePropertyReading,
} from "../source-property";
import { propertySamplePlaceholder, type SourcePropertyValue } from "../source-property";
import {
	propertyGroupTarget,
	type SourcePropertyGroupExpectation,
	samePropertyGroupTarget,
} from "../source-property-group";
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
import { imageExpectation } from "./source-image-values";
import { createSourceJournal } from "./source-journal";
import { type Selection, Sources, type Target } from "./source-origins";
import { applySourcePatches } from "./source-patches";
import { compilePropertySource, inspectPropertyCss } from "./source-property-compile";
import {
	declarationFile,
	guardGroupedSources,
	planDeclarationLiteral,
	propertySourceOwner,
	requestedDeclaration,
} from "./source-property-declaration";
import { externalPropertySignature, nativePropertyEffects } from "./source-property-dependencies";
import { readPropertyEffects } from "./source-property-effects";
import { planPropertyGroup } from "./source-property-group";
import { guardPropertyEffects, propertyReadKeys } from "./source-property-guard";
import { planPropertyLiteral } from "./source-property-literal";
import { planPropertyValue } from "./source-property-plan";
import { propertyPreviewDeclarations } from "./source-property-preview";
import { propertyReading } from "./source-property-reading";
import { propertyScopePaths } from "./source-property-scope";
import { type PropertyContext, propertyState } from "./source-property-state";
import {
	planStyleLiteral,
	planStyleMembers,
	type StyleMember,
	styleMemberEffects,
	styleMemberKey,
	styleMemberProperty,
} from "./source-property-style";
import { resolvePropertySource } from "./source-property-target";
import { retryPropertySource, retryTextSource } from "./source-retry";
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

interface PropertyProof {
	selections?: SourcePropertyGroupExpectation["selections"];
	environment: SourcePropertyEnvironment;
	roots: ReadonlySet<string>;
	scopePaths: Extract<SourcePublication["expected"], { kind: "property" }>["scopePaths"];
	/** The source this proof writes, and what it needs to write it. */
	written?:
		| {
				kind: "style";
				address: NonNullable<Target["style"]>["address"];
				members: readonly StyleMember[];
				after: readonly StyleMember[];
		  }
		| { kind: "declaration"; file: string; effect: SourcePropertyEffect; value: string };
}
interface StructuralParent {
	frame: string;
	occurrence: string;
}
interface OriginalRead {
	inverseExpected?: SourcePublication["expected"];
	property?: PropertyProof;
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
	/** The file this operation writes, where that is not the executable source. */
	written?: string;
}
interface Receipt {
	property?: PropertyProof;
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
	/** The file the operation wrote, where that is not the executable source. */
	written?: string;
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
			if (operation.kind === "literal" && operation.field !== original.field)
				throw new Error("the source purpose does not match the original field");
			if (operation.kind === "image" && retry)
				throw new Error("read the current image binding before trying this replacement again");
			const retryFrom = retry ? compilation : undefined;
			if (retry && operation.kind !== "literal" && operation.kind !== "property")
				throw new Error("this source operation has no admitted retry planner");
			let resolved = isPropertyOperation(operation)
				? {
						kind: "property" as const,
						...resolvePropertySource(root, compilation, original, generation, operation),
					}
				: operation.kind === "image"
					? { kind: "image" as const, ...resolveImageSource(root, compilation, original, generation) }
					: { kind: "literal" as const, ...resolveTextSource(root, compilation, original, generation) };
			if (retry) {
				const current = await currentCompilation(root, frame, compilation);
				if (readingCoverage !== (coverage.get(root) ?? 0))
					throw new Error("source observation changed during retry");
				resolved =
					operation.kind === "property"
						? {
								kind: "property" as const,
								...retryPropertySource(root, compilation, current, original, generation, operation),
							}
						: { kind: "literal" as const, ...retryTextSource(root, compilation, current, original, generation) };
				compilation = current;
			}
			const { cellKey, cell, target } = resolved;
			let property: SourcePropertyReading | undefined;
			if (operation.kind === "property") {
				if (resolved.kind !== "property") throw new Error("the original property environment is missing");
				property = propertyReading(
					await compilePropertySource(root, compilation.inputs, cell.value, compilation.packet.bundledCss),
					operation,
					resolved.environment,
					{ native: observed.propertyNative, style: target?.style?.members, matched: observed.propertyRules },
				);
			}
			const found = lookupFrame(root, frame);
			if (found.kind !== "found") throw new Error("the original frame is no longer there");
			const file = sourceTarget(root, cell.file, compilation.inputs).file;
			const handle = randomUUID();
			const read: SourceRead = {
				operation,
				...(target?.asset ? { asset: target.asset.path } : {}),
				handle,
				owner,
				original: { ...observed },
				...(property ? { property } : {}),
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

	async function reach(root: string, handle: string, inventories: SourceInventory[], sample?: SourcePropertyValue) {
		const held = reads.get(handle);
		if (!held || held.root !== root)
			return { ok: false as const, reason: "the original source read is no longer available" };
		const found = await discover(root, held, inventories);
		if (!found.ok || held.read.operation.kind !== "property") return found;
		const placeholder = `var(--spool-property-sample-${held.read.handle})`;
		const planned = await preview(root, handle, held.read.generation, 0, held.read.original, {
			kind: "property",
			value:
				sample?.kind === "binding"
					? {
							kind: "binding",
							tokens: sample.tokens.map((token) => token.replaceAll(propertySamplePlaceholder, placeholder)),
						}
					: { kind: "custom", value: placeholder },
		});
		if (
			planned.ok &&
			planned.preview.frames.some(
				(frame) => frame.css.includes(placeholder) || frame.bundledCss.includes(placeholder),
			)
		) {
			const declarations = (
				await Promise.all(
					planned.preview.frames.map(async (frame) => {
						const compiled = await inspectPropertyCss(`${frame.css}\n${frame.bundledCss}`);
						return propertyPreviewDeclarations(compiled.effects, placeholder);
					}),
				)
			).flat();
			if (declarations.length)
				held.read = { ...held.read, propertyPreview: { placeholder, declarations, plan: planned.preview } };
		}
		return { ok: true as const, read: held.read };
	}
	async function describe(
		root: string,
		frame: string,
		original: SourceOccurrence,
		inventories: SourceInventory[],
		operation: SourceOperation = { kind: "literal", ...(original.field ? { field: original.field } : {}) },
		readings: readonly string[] = [],
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
			const resolved = isPropertyOperation(operation)
				? {
						kind: "property" as const,
						...resolvePropertySource(root, publication.compilation, original, 0, operation),
					}
				: operation.kind === "image"
					? { kind: "image" as const, ...resolveImageSource(root, publication.compilation, original, 0) }
					: { kind: "literal" as const, ...resolveTextSource(root, publication.compilation, original, 0) };
			const { cellKey, cell, target } = resolved;
			let property: SourcePropertyReading | undefined;
			let properties: Record<string, SourcePropertyReading> | undefined;
			if (operation.kind === "property") {
				if (resolved.kind !== "property") throw new Error("the original property environment is missing");
				// One compile of this class cell answers every property the controls draw.
				const certificate = await compilePropertySource(
					root,
					publication.compilation.inputs,
					cell.value,
					publication.compilation.packet.bundledCss,
				);
				const members = target?.style?.members;
				const context = {
					native: original.propertyNative,
					style: members,
					matched: original.propertyRules,
				};
				property = propertyReading(certificate, operation, resolved.environment, context);
				if (readings.length)
					properties = Object.fromEntries(
						readings.map((name) => [
							name,
							propertyReading(certificate, { ...operation, property: name }, resolved.environment, context),
						]),
					);
			}
			const read: SourceRead = {
				...(property ? { property } : {}),
				...(properties ? { properties } : {}),
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
		operation: SourceOperation,
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
					const target = isPropertyOperation(operation)
						? resolvePropertySource(
								root,
								publication.compilation,
								use.original,
								generation,
								operation,
								mode === "inverse" ? { kind: "inverse", cell } : undefined,
							)
						: resolveSource(
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
				: observedUses(root, cell, held.read.generation, inventories, "read", held.read.operation);
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
		// The file an operation writes is its executable source, except where an
		// authored stylesheet is the source that owns the property.
		const target = held.written ?? held.file;
		const originalInput = held.compilation.inputs.get(target);
		const input = originalInput ? journal.current(target, originalInput) : undefined;
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
						target,
						next,
						held.imageRestore,
						held.sourceOnly,
					)
				: held.image
					? await compileImageChange(compiler, held.root, held.frame, current, target, next, held.image)
					: undefined;
			if (!imageSnapshot) throw new Error("the original image staging evidence is missing");
			const key = held.read.cell ?? held.read.original.cell;
			const image = imageSnapshot.cells[key];
			if (!image?.image || image.value !== expected.value || (image.absent === true) !== expected.absent)
				throw new Error("the planned image no longer resolves to its requested source value");
			expected = { ...expected, source: image.source };
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
					? await compileImageInverse(compiler, held.root, use.frame, current, target, next, held.imageRestore)
					: held.image
						? await compileImageChange(compiler, held.root, use.frame, current, target, next, held.image)
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
				file === target ? input : journal.current(file, captured),
			]),
		);
		// Source remains ordinary files. This final synchronous check and rename
		// cannot exclude an uncoordinated process saving after the check.
		const forward = applySourcePatches(before, executed ?? [spanBetween(next, before)]);
		if (forward.text !== next) throw new Error("the source operation does not match its planned spans");
		writeAtomic(target, next);
		const after = readInput(target);
		const operation = journal.record(
			target,
			input,
			after,
			forward.patches.map((patch) => ({ ...patch, before: before.slice(patch.start, patch.end) })),
			inverseOf,
		);
		frozen.set(target, after);
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
			...(held.property ? { property: held.property } : {}),
			...(expected.kind === "image"
				? { imageRestore: sourceHistoryCompilation(held.root, held.compilation, target) }
				: {}),
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
			expected: structureBefore ??
				held.inverseExpected ?? {
					kind: "literal",
					value: held.compilation.cells[held.read.cell ?? held.read.original.cell]?.value ?? held.read.value,
					absent: held.compilation.cells[held.read.cell ?? held.read.original.cell]?.absent === true,
				},
			required: sourceHistoryCompilation(held.root, saved, target),
			cell: held.read.cell ?? held.read.original.cell,
			...(held.read.reach ? { reach: held.read.reach } : {}),
			operation,
			coverage: held.coverage,
			root: held.root,
			frame: held.frame,
			file: held.file,
			...(held.written ? { written: held.written } : {}),
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
			inverse.required = sourceHistoryCompilation(held.root, inverse.compilation, target);
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
			inverse.required = sourceHistoryCompilation(held.root, retained, target);
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

	async function planReadProperty(held: OriginalRead, change: SourceChange) {
		const operation = held.read.operation;
		if (!isPropertyOperation(operation)) throw new Error("this read has no property purpose");
		const { target, environment } = resolvePropertySource(
			held.root,
			held.compilation,
			held.read.original,
			held.read.generation,
			operation,
			held.retryFrom && held.read.cell
				? { kind: "retry", cell: held.read.cell, before: held.read.original.value, after: held.read.value }
				: undefined,
		);
		const planned = await (async () => {
			if (operation.kind === "property" && change.kind === "property") {
				// One class compile answers who owns this property here, and the same
				// certificate goes on to plan the class write when the class owns it.
				const certificate = await compilePropertySource(
					held.root,
					held.compilation.inputs,
					held.read.value,
					held.compilation.packet.bundledCss,
				);
				const read = readPropertyEffects(certificate, operation.property, operation.scope, environment);
				const members = operation.scope === "" ? (target.style?.members ?? []) : [];
				const owner =
					operation.scope === ""
						? propertySourceOwner(
								read.roots,
								read.effects,
								styleMemberEffects(members),
								certificate,
								environment,
								held.read.original.propertyRules,
							)
						: ({ kind: "class" } as const);
				const kept = {
					before: [] as readonly string[],
					after: [] as readonly string[],
					original: certificate,
					desired: certificate,
					roots: read.roots,
					consumers: nativePropertyEffects(certificate, read.roots, environment),
					external: externalPropertySignature(certificate, read.roots, [], environment),
					next: held.read.value,
				};
				const declared = (property: string) =>
					requestedDeclaration(property, change.value, (tokens) =>
						compilePropertySource(
							held.root,
							held.compilation.inputs,
							tokens.join(" "),
							held.compilation.packet.bundledCss,
						),
					);
				if (owner.kind === "style" && target.style)
					return {
						plan: {
							...kept,
							written: {
								kind: "style" as const,
								address: target.style.address,
								members,
								after: planStyleMembers(
									members,
									operation.property,
									owner.members,
									await declared(styleMemberProperty(styleMemberKey(operation.property))),
								),
							},
						},
						selections: undefined,
					};
				if (owner.kind === "declaration") {
					if (owner.effects.length !== 1)
						throw new Error("this control's sides are declared separately in their own stylesheet");
					const effect = owner.effects[0]!;
					const value = await declared(effect.property);
					if (value === null)
						throw new Error("removing an authored declaration is not a supported property operation");
					const file = declarationFile(effect, held.compilation.inputs);
					return {
						plan: { ...kept, written: { kind: "declaration" as const, file, effect, value } },
						selections: undefined,
					};
				}
				return {
					plan: await planPropertyValue(
						held.root,
						held.compilation.inputs,
						held.read.value,
						operation,
						change.value,
						environment,
						held.compilation.packet.bundledCss,
						certificate,
					),
					selections: undefined,
				};
			}
			if (operation.kind === "properties" && change.kind === "properties") {
				if (!samePropertyGroupTarget(operation.target, propertyGroupTarget(change.value)))
					throw new Error("the grouped request differs from its original source purpose");
				const plan = await planPropertyGroup(
					held.root,
					held.compilation.inputs,
					held.read.value,
					change.value,
					environment,
					held.compilation.packet.bundledCss,
				);
				const grouped = await compilePropertySource(
					held.root,
					held.compilation.inputs,
					held.read.value,
					held.compilation.packet.bundledCss,
				);
				guardGroupedSources(
					plan.selections,
					grouped,
					target.style ? styleMemberEffects(target.style.members) : [],
					environment,
					held.read.original.propertyRules,
				);
				return { plan, selections: plan.selections };
			}
			throw new Error("this source read does not authorize that property request");
		})();
		const plan = planned.plan;
		const selections: SourcePropertyGroupExpectation["selections"] | undefined = planned.selections?.map(
			({ consumers, roots, ...selection }) => ({ ...selection, roots: [...roots], effects: consumers }),
		);
		const written = "written" in plan ? plan.written : undefined;
		const proof: PropertyProof = {
			environment,
			roots: propertyReadKeys(plan.original, plan.desired, plan.roots, environment),
			// An inline member is one unconditional declaration on the element: it
			// has no compiled condition, and an empty path is what that means.
			scopePaths:
				written?.kind === "declaration"
					? [written.effect.path]
					: written?.kind === "style"
						? [[]]
						: operation.kind === "property"
							? propertyScopePaths(plan.original, plan.desired, operation, environment)
							: (selections?.flatMap((selection) => selection.scopePaths) ?? []),
			...(selections ? { selections } : {}),
			...(written ? { written } : {}),
		};
		return { target, environment, plan, proof };
	}

	async function checkPropertyChanges(held: OriginalRead, proof: PropertyProof, compilerContext: RetainedCompilation) {
		if (!isPropertyOperation(held.read.operation)) throw new Error("property proof has another operation purpose");
		const operation = held.read.operation;
		const inputs = new Map(held.compilation.inputs);
		const original = inputs.get(held.file);
		if (!original) throw new Error("the original property source input is missing");
		const context: PropertyContext = {
			root: held.root,
			inputs,
			file: held.file,
			cellKey: held.read.cell ?? held.read.original.cell,
			operation,
			environment: proof.environment,
			roots: proof.roots,
			scopePaths: proof.scopePaths,
			selections: proof.selections,
			...(proof.written?.kind === "style" ? { style: proof.written.members } : {}),
			source: proof.written?.kind ?? "class",
		};
		const state = (source: string, snapshot: RetainedCompilation) =>
			propertyState(context, { compilation: snapshot, source });
		let snapshot = compilerContext;
		let before = await state(original.bytes.toString("utf8"), snapshot);
		let frameBefore = await inspectPropertyCss(`${snapshot.packet.css}\n${snapshot.packet.bundledCss}`);
		const steps = [...inputs]
			.flatMap(([file, input]) => journal.changes(file, input).map((step) => ({ file, ...step })))
			.sort((a, b) => a.order - b.order);
		for (const step of steps) {
			inputs.set(step.file, step.after);
			const input = inputs.get(held.file);
			if (!input) throw new Error("property source input disappeared");
			snapshot = await compiler.compileSnapshot(
				held.root,
				held.frame,
				// Required source identities stay narrow; compilation retains its original frozen closure.
				new Map([...compilerContext.inputs, ...inputs]),
				sequence,
				compilerContext.absent,
				compilerContext,
			);
			const after = await state(input.bytes.toString("utf8"), snapshot);
			const frameAfter = await inspectPropertyCss(`${snapshot.packet.css}\n${snapshot.packet.bundledCss}`);
			if (!step.canceled)
				guardPropertyEffects(
					before.certificate,
					after.certificate,
					proof.roots,
					proof.environment,
					frameBefore.effects,
					frameAfter.effects,
				);
			before = after;
			frameBefore = frameAfter;
		}
		return { inputs, state: before, snapshot };
	}
	async function preview(
		root: string,
		handle: string,
		generation: number,
		revision: number,
		original: SourceOccurrence,
		change: SourceChange,
	): Promise<{ ok: true; preview: SourcePropertyPreview } | { ok: false; reason: string }> {
		const held = reads.get(handle);
		try {
			if (
				!held ||
				held.root !== root ||
				held.read.generation !== generation ||
				!sameSourceOccurrence(held.read.original, original)
			)
				throw new Error("the original property edit is no longer available");
			if (!isPropertyOperation(held.read.operation) || change.kind !== held.read.operation.kind)
				throw new Error("this source read does not authorize a property preview");
			const observed = await observe(root, held.frame, generation, held.observer);
			if (!observed || !sameSourceOccurrence(observed, original))
				throw new Error("the original property occurrence changed");
			valid(root, held.compilation);
			const { target, plan, proof } = await planReadProperty(held, change);
			const current = await checkPropertyChanges(held, proof, held.compilation);
			const written = (proof.written?.kind === "declaration" ? proof.written.file : undefined) ?? held.file;
			const input = held.compilation.inputs.get(written);
			if (!input) throw new Error("the original property source input is missing");
			const text = input.bytes.toString("utf8");
			const patches = journal.transform(
				written,
				input,
				proof.written?.kind === "declaration"
					? planDeclarationLiteral(text, proof.written.effect, proof.written.value)
					: proof.written?.kind === "style"
						? planStyleLiteral(text, proof.written.address, proof.written.members, proof.written.after)
						: planPropertyLiteral(text, target, plan.before, plan.after),
			);
			const now = current.inputs.get(written);
			if (!now) throw new Error("the current property source input is missing");
			const next = applySourcePatches(now.bytes.toString("utf8"), patches).text;
			const frames: SourcePropertyPreview["frames"][number][] = [];
			let value: string | undefined;
			const seen = new Set<string>();
			for (const use of [{ frame: held.frame, original }, ...(held.read.reach?.uses ?? [])]) {
				if (seen.has(use.original.publication)) continue;
				seen.add(use.original.publication);
				const publication = compiler.publication(use.original.publication);
				if (!publication || publication.root !== root || publication.frame !== use.frame)
					throw new Error("a property preview frame changed");
				valid(root, publication.compilation);
				const inputs = new Map(
					[...publication.compilation.inputs].map(([file, input]) => [file, journal.current(file, input)]),
				);
				inputs.set(written, { ...now, bytes: Buffer.from(next) });
				const snapshot = await compiler.compileSnapshot(
					root,
					use.frame,
					inputs,
					sequence,
					publication.compilation.absent,
					publication.compilation,
				);
				const key = held.read.cell ?? original.cell;
				const retained = snapshot.cells[key];
				const className =
					snapshot.packet.values[key] ??
					(retained?.field === "className" && retained.absent ? retained.value : undefined);
				if (className === undefined || (value !== undefined && value !== className))
					throw new Error("property preview frames disagree about their source literal");
				value = className;
				frames.push({
					publication: use.original.publication,
					css: snapshot.packet.css,
					bundledCss: snapshot.packet.bundledCss,
				});
			}
			if (reads.get(handle) !== held) throw new Error("the property preview was cancelled");
			valid(root, held.compilation);
			if (value === undefined) throw new Error("no property preview frame was available");
			// A member that leaves the list is the removal of its declaration, which
			// an empty value is; every remaining member proposes its own value.
			const member = proof.written?.kind === "style" ? proof.written : undefined;
			const authored = member ? styleMemberEffects(member.members) : [];
			const wanted = member ? styleMemberEffects(member.after) : [];
			const inline = [
				...wanted.map((effect) => ({ property: effect.property, value: effect.value })),
				...authored
					.filter((effect) => !wanted.some((next) => next.property === effect.property))
					.map((effect) => ({ property: effect.property, value: "" })),
			];
			return { ok: true, preview: { generation, revision, value, frames, ...(inline.length ? { inline } : {}) } };
		} catch (error) {
			return { ok: false, reason: reason(error) };
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
					if (held.read.operation.kind === "property")
						retryPropertySource(
							root,
							held.retryFrom,
							current,
							held.read.original,
							generation,
							held.read.operation,
						);
					else retryTextSource(root, held.retryFrom, current, held.read.original, generation);
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

				if (
					isPropertyOperation(held.read.operation) &&
					(change.kind === "property" || change.kind === "properties")
				) {
					const { target, environment, plan, proof } = await planReadProperty(held, change);
					const current = await checkPropertyChanges(held, proof, held.compilation);
					const written = (proof.written?.kind === "declaration" ? proof.written.file : undefined) ?? held.file;
					const input = held.compilation.inputs.get(written);
					if (!input) throw new Error("the original property source input is missing");
					const authored = input.bytes.toString("utf8");
					const patches =
						proof.written?.kind === "declaration"
							? planDeclarationLiteral(authored, proof.written.effect, proof.written.value)
							: proof.written?.kind === "style"
								? planStyleLiteral(source, proof.written.address, proof.written.members, proof.written.after)
								: planPropertyLiteral(source, target, plan.before, plan.after);
					const transformed = journal.transform(written, input, patches);
					const currentSource = current.inputs.get(written)?.bytes.toString("utf8");
					if (currentSource === undefined) throw new Error("the current property source input is missing");
					const next = applySourcePatches(currentSource, transformed).text;
					// A stylesheet write changes an input the class cell still reads
					// from, so the expectation compiles against the written bytes while
					// the executable source it belongs to stays where it was.
					const inputs = new Map(current.inputs);
					if (proof.written?.kind === "declaration") inputs.set(written, { ...input, bytes: Buffer.from(next) });
					const after = await propertyState(
						{
							root,
							inputs,
							file: held.file,
							cellKey: held.read.cell ?? original.cell,
							operation: held.read.operation,
							environment,
							roots: proof.roots,
							scopePaths: proof.scopePaths,
							selections: proof.selections,
							...(proof.written?.kind === "style" ? { style: proof.written.after } : {}),
							source: proof.written?.kind ?? "class",
						},
						{
							compilation: current.snapshot,
							source:
								proof.written?.kind === "declaration"
									? (current.inputs.get(held.file)?.bytes.toString("utf8") ?? source)
									: next,
						},
					);
					held.property = proof;
					held.inverseExpected = current.state.expected;
					return await publish(
						proof.written?.kind === "declaration" ? { ...held, written } : held,
						next,
						after.expected,
						transformed,
					);
				}
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
						{ ...held, inverseExpected: imageExpectation(cell, realDesignDir(root)) },
						applySourcePatches(journal.current(held.file, input).bytes.toString("utf8"), patches).text,
						{
							kind: "image",
							source: cell.source,
							value: held.image.value,
							absent: false,
							asset: held.image.path,
						},
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
				if (authenticated && held) {
					try {
						valid(root, held.compilation);
						const snapshot = await currentCompilation(root, held.frame, held.compilation);
						if (held.read.operation.kind === "property") {
							const resolved = retryPropertySource(
								root,
								held.compilation,
								snapshot,
								held.read.original,
								generation,
								held.read.operation,
							);
							const reading = propertyReading(
								await compilePropertySource(
									root,
									snapshot.inputs,
									resolved.cell.value,
									snapshot.packet.bundledCss,
								),
								held.read.operation,
								resolved.environment,
							);
							if (held.coverage === (coverage.get(root) ?? 0))
								current = {
									kind: "property",
									value: reading.tokens.length
										? { kind: "binding", tokens: reading.tokens }
										: { kind: "remove" },
								};
						} else if (held.read.operation.kind === "literal") {
							const resolved = retryTextSource(
								root,
								held.retryFrom ?? held.compilation,
								snapshot,
								held.read.original,
								generation,
							);
							if (held.coverage === (coverage.get(root) ?? 0))
								current = { kind: "literal", text: resolved.cell.value };
						}
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
						: observedUses(root, held.cell, held.generation, inventories, "inverse", held.purpose);
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
				const written = held.written ?? held.file;
				const source = held.compilation.inputs.get(written)?.bytes.toString("utf8");
				if (source === undefined) throw new Error("the inverse source read is incomplete");
				const input = held.compilation.inputs.get(written);
				if (!input) throw new Error("the original input is missing");
				const transformed = journal.transform(written, input, held.inverse);
				if (transformed.length === 0) throw new Error("the inverse source span is missing");
				const cell = held.compilation.cells[held.cell];
				if (!cell && !held.structure) throw new Error("the original source role changed");
				const inverseRead: OriginalRead = {
					observer: "",
					...(held.imageRestore
						? { imageRestore: held.imageRestore, inverseExpected: imageExpectation(cell!, realDesignDir(root)) }
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
					...(held.written ? { written: held.written } : {}),
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
				};
				const next = applySourcePatches(journal.current(written, input).bytes.toString("utf8"), transformed).text;
				let expected = held.expected;
				if (held.property && isPropertyOperation(held.purpose)) {
					const current = await checkPropertyChanges(
						{ ...inverseRead, compilation: held.required },
						held.property,
						held.compilation,
					);
					const inputs = new Map(current.inputs);
					if (held.written) inputs.set(held.written, { ...input, bytes: Buffer.from(next) });
					const after = await propertyState(
						{
							root,
							inputs,
							file: held.file,
							cellKey: held.cell,
							operation: held.purpose,
							environment: held.property.environment,
							roots: held.property.roots,
							scopePaths: held.property.scopePaths,
							selections: held.property.selections,
							...(held.property.written?.kind === "style" ? { style: held.property.written.members } : {}),
							source: held.property.written?.kind ?? "class",
						},
						{
							compilation: current.snapshot,
							source: held.written ? (current.inputs.get(held.file)?.bytes.toString("utf8") ?? "") : next,
						},
					);
					inverseRead.property = held.property;
					inverseRead.inverseExpected = current.state.expected;
					expected = after.expected;
				}
				return await publish(inverseRead, next, expected, transformed, held.operation);
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
		preview,
		inverse,
		current,
		delivered,
		cancel: (root: string, handle: string) => {
			if (reads.get(handle)?.root === root) reads.delete(handle);
		},
	};
}
