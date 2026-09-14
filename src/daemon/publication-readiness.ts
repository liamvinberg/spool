import type { FlowEdge, FlowGraph, FrameGraph } from "./flows";
import { publicationSource } from "./publication-source";

export type ReadinessCode =
	| "entry-missing"
	| "invalid-links"
	| "links-disagree"
	| "navigation-unreadable"
	| "source-unreadable"
	| "target-missing";

export interface ReadinessDiagnostic {
	code: ReadinessCode;
	frame: string;
	message: string;
	remedy: string;
	path?: string;
	line?: number;
}

export interface PublicationOutgoing {
	frame: string;
	targets: string[];
	edges: FlowEdge[];
	declared: boolean;
}

/**
 * The closed connected set consumed by static export and hosted runtime
 * enforcement. `ok` means every possible outgoing name is known and exists.
 */
export interface PublicationReadiness {
	entry: string;
	ok: boolean;
	included: string[];
	outgoing: PublicationOutgoing[];
	diagnostics: ReadinessDiagnostic[];
}

export async function publicationReadiness(
	graph: FlowGraph,
	root: string,
	entry: string,
): Promise<PublicationReadiness> {
	const sources = await graph.sources(root);
	return readinessFrom(entry, [...sources.keys()], sources, root);
}

export function readinessFrom(
	entry: string,
	frames: readonly string[],
	sources: ReadonlyMap<string, FrameGraph>,
	root?: string,
): PublicationReadiness {
	const alive = new Set(frames);
	const diagnostics: ReadinessDiagnostic[] = [];
	if (!alive.has(entry)) {
		return {
			entry,
			ok: false,
			included: [],
			outgoing: [],
			diagnostics: [
				{
					code: "entry-missing",
					frame: entry,
					message: `Entry frame "${entry}" does not exist.`,
					remedy: "Choose an existing frame as the publication entry.",
				},
			],
		};
	}

	const included: string[] = [];
	const outgoing: PublicationOutgoing[] = [];
	const queued = [entry];
	const seen = new Set<string>();
	while (queued.length > 0) {
		const frame = queued.shift();
		if (frame === undefined || seen.has(frame)) continue;
		seen.add(frame);
		included.push(frame);
		const source = sources.get(frame);
		if (source === undefined) continue;
		const strict =
			root === undefined
				? {
						sites: source.sites,
						unreadable: source.unreadable,
						links: source.links,
						invalidLinks: source.invalidLinks,
						failures:
							source.parseFailure === undefined
								? []
								: [{ ...source.parseFailure, reason: "Source could not be parsed." }],
					}
				: publicationSource(root, frame, source);
		for (const failure of strict.failures) {
			diagnostics.push(
				at(
					"source-unreadable",
					frame,
					failure,
					failure.reason,
					"Use a direct value import or export so this navigation can be attributed.",
				),
			);
		}
		if (strict.invalidLinks !== undefined) {
			diagnostics.push(
				at(
					"invalid-links",
					frame,
					strict.invalidLinks,
					"The exported links declaration is not a readonly object of literal frame names.",
					'Export `const links = { name: "frame-name" } as const` from frame.tsx.',
				),
			);
		}

		const byTarget = new Map<string, typeof strict.sites>();
		for (const site of strict.sites) byTarget.set(site.target, [...(byTarget.get(site.target) ?? []), site]);
		const frameEdges: FlowEdge[] = [...byTarget].map(([to, sites]) => ({
			from: frame,
			to,
			certainty: sites.some((site) => site.conditional === undefined) ? "will" : "might",
			sites: sites.map(({ target: _target, ...site }) => site),
			...(alive.has(to) ? {} : { missing: true as const }),
		}));
		const literals = new Set(frameEdges.map((edge) => edge.to));
		const declared = strict.links === undefined ? undefined : new Set(Object.values(strict.links.values));
		if (declared !== undefined) {
			for (const target of literals) {
				if (declared.has(target)) continue;
				const site = frameEdges.find((edge) => edge.to === target)?.sites[0];
				diagnostics.push(
					at(
						"links-disagree",
						frame,
						site,
						`Navigation to "${target}" is absent from the links declaration.`,
						`Add "${target}" to links or remove that navigation.`,
					),
				);
			}
		} else {
			for (const site of strict.unreadable) {
				diagnostics.push(
					at(
						"navigation-unreadable",
						frame,
						site,
						"A navigation destination cannot be established statically.",
						"Use a literal, a simple const or finite branch, or route through an exported links object.",
					),
				);
			}
		}

		const targets = [...(declared ?? literals)].sort();
		outgoing.push({ frame, targets, edges: frameEdges, declared: declared !== undefined });
		for (const target of targets) {
			if (!alive.has(target)) {
				const site = frameEdges.find((edge) => edge.to === target)?.sites[0] ?? strict.links;
				diagnostics.push(
					at(
						"target-missing",
						frame,
						site,
						`Navigation target "${target}" does not exist.`,
						`Create or rename the target frame, or update "${target}" in the source.`,
					),
				);
				continue;
			}
			if (!seen.has(target)) queued.push(target);
		}
	}

	return { entry, ok: diagnostics.length === 0, included, outgoing, diagnostics };
}

function at(
	code: ReadinessCode,
	frame: string,
	site: { path: string; line: number } | undefined,
	message: string,
	remedy: string,
): ReadinessDiagnostic {
	return { code, frame, message, remedy, ...(site === undefined ? {} : { path: site.path, line: site.line }) };
}
