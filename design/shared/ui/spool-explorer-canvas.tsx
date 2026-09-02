import type { FrameNode, StagePage } from "../lib/explorer-tree";
import { cn } from "../lib/utils";
import { PageStill, SaidEmpty, StageLine, ThroughField } from "./spool-explorer-empty";
import { Still } from "./spool-explorer-wire";

/**
 * The field behind the explorer: the active page's frames, drawn small.
 *
 * It exists so the rail has somewhere to point — selecting a frame lights it
 * here, and "Reveal on canvas" blinks it.
 *
 * `take` is the one variable the empty-page frames turn: what this field does
 * when the page you are standing on has no frames on it. `bare` is the shipped
 * picture, which is nothing at all.
 */

export type EmptyTake = "bare" | "say" | "pages" | "through";

export function ExplorerCanvas({
	label,
	path,
	frames,
	pages,
	selected,
	revealed,
	take = "bare",
	onEnterPage,
}: {
	label: string;
	path: string;
	frames: readonly FrameNode[];
	pages: readonly StagePage[];
	selected: readonly string[];
	revealed: { name: string; token: number } | null;
	take?: EmptyTake;
	onEnterPage?: ((id: string) => void) | undefined;
}) {
	const enter = onEnterPage ?? (() => undefined);
	// a page drawn as an object is an object whether or not the field is empty,
	// so this take is the one that changes a page that has frames too
	const objects = take === "pages" && pages.length > 0;
	const hollow = frames.length === 0;

	return (
		<div className="absolute inset-0 overflow-hidden">
			<StageLine path={path} label={label} frames={frames.length} pages={pages.length} />

			{hollow && !objects ? (
				// every take answers the page nobody has written into yet, and past
				// `bare` they all answer it the same way: the words
				take === "through" && pages.length > 0 ? (
					<ThroughField pages={pages} onEnter={enter} />
				) : take === "bare" ? null : (
					<SaidEmpty page={path === "" ? label : path} pages={pages} />
				)
			) : (
				<div
					className={cn(
						"flex h-full flex-wrap content-center items-start justify-center gap-x-10 gap-y-8 px-10",
						frames.length + (objects ? pages.length : 0) > 6 && "scale-[0.72]",
					)}
				>
					{frames.map((node, index) => (
						<Still
							key={node.id}
							node={node}
							lit={selected.includes(node.id)}
							threaded={index === 1}
							flash={revealed !== null && revealed.name === node.name ? revealed.token : null}
						/>
					))}
					{objects
						? pages.map((sub) => <PageStill key={sub.id} page={sub} onEnter={() => enter(sub.id)} />)
						: null}
				</div>
			)}
		</div>
	);
}
