import type { FrameGraph } from "./flows";
import type { RenderedTarget } from "./resolved-targets";
import { createRenderedReader, projectScenarios, recordRenderedTargets } from "./resolved-targets";

/**
 * The value-filling pass (#34): render the frames whose walks the parser could
 * not read, once per scenario, and store what the DOM says. Explicitly asked
 * for rather than ambient — a render costs a page load per frame per scenario,
 * and a project with many of both should not pay that without asking.
 *
 * Only frames with an unresolvable site are rendered, and only when their
 * cached read is stale: a project whose targets are all literals never launches
 * a browser at all. A frame the reader cannot read (no pinned build, a frame
 * that throws) records nothing and stays honestly dark.
 */

export interface ResolveFrame {
	name: string;
	width: number;
	height: number;
}

export interface ResolvePassRequest {
	root: string;
	/** The registered project name, as the served URL spells it. */
	project: string;
	/** A dialable origin for this daemon — absent before the server binds. */
	origin: string;
	frames: ResolveFrame[];
}

export interface ResolvePassDeps {
	read(target: { url: string; width: number; height: number }): Promise<RenderedTarget[] | undefined>;
	/** The kept graph's source half — whose sites are dark, and at what bytes. */
	sources(root: string): Promise<Map<string, FrameGraph>>;
	/** Announce that the graph moved, once, after the whole pass. */
	moved(root: string): void;
	now(): string;
}

export interface ResolvePassResult {
	/** Frames whose cached read was already fresh. */
	skipped: number;
	/** Frames re-read and recorded this pass. */
	read: number;
	/** Frames with dark sites the reader could not answer for. */
	unavailable: number;
}

/**
 * A frame with an unresolvable site the render could speak to. No anchor means
 * no element to match a rendered attribute against; a coded call means nothing
 * in the DOM to match at all, so `ui.go(pick())` stays dark whatever renders.
 */
function wantsRender(graph: FrameGraph): boolean {
	return graph.unreadable.some((site) => site.via === "data-go" && site.anchor !== undefined);
}

export function createResolvePass(deps: ResolvePassDeps) {
	async function run(request: ResolvePassRequest): Promise<ResolvePassResult> {
		const { root, project, origin } = request;
		const scenarios = projectScenarios(root);
		// no scenario file means one render on the empty seed — that is what
		// playing does too, so it is the same frame the person would see
		const seeds = scenarios.names.length === 0 ? [undefined] : scenarios.names;
		const alive = request.frames.map((frame) => frame.name);
		const result: ResolvePassResult = { skipped: 0, read: 0, unavailable: 0 };
		let moved = false;
		// the graph the daemon keeps already read every frame's source: asking it
		// per frame walked the whole project once per frame (#109)
		const graphs = await deps.sources(root);
		const rendered = createRenderedReader(root);

		for (const frame of request.frames) {
			const graph = graphs.get(frame.name);
			if (graph === undefined || !wantsRender(graph)) continue;
			const sourceHash = graph.hash;
			// a fresh read is fresh whatever it found: a frame that rendered and
			// wrote no [data-go] answered, and re-asking it every pass paid a page
			// load per scenario for the answer already on disk (#150)
			if (rendered(frame.name, sourceHash, scenarios.hash) !== null) {
				result.skipped++;
				continue;
			}
			const found: RenderedTarget[] = [];
			let answered = false;
			for (const seed of seeds) {
				const url = `${origin}/p/${encodeURIComponent(project)}/frames/${encodeURIComponent(frame.name)}${
					seed === undefined ? "" : `?scenario=${encodeURIComponent(seed)}`
				}`;
				const targets = await deps.read({ url, width: frame.width, height: frame.height });
				if (targets === undefined) continue;
				answered = true;
				found.push(...targets);
			}
			if (!answered) {
				result.unavailable++;
				continue;
			}
			recordRenderedTargets(root, frame.name, sourceHash, scenarios.hash, found, alive, deps.now());
			result.read++;
			moved = true;
		}
		if (moved) deps.moved(root);
		return result;
	}

	return { run };
}
