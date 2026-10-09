import { useRef } from "react";
import type { ProjectedPlaceholder } from "../../daemon/projection";
import { cn } from "../cn";
import type { AgentEntry, AgentTile } from "./agent-transcript";
import { type CameraStore, useCameraFollow } from "./camera-store";

/**
 * A placeholder frame on the canvas (#369): the frame spool made for a designer the moment
 * it started, dashed until its frame.tsx lands, holding the direction's name and its brief.
 *
 * While this canvas's own turn has the designer at work, what it is doing shows inside the
 * frame — reading, drawing, checking — with a quiet live mark, where a companion used to
 * dock. A teammate's placeholder (#378) is drawn in their colour and says whose designer it
 * is, with what it is doing where their presence says. When the source lands the
 * projection lists it as a frame in the same place, and this goes.
 *
 * The words keep one size on screen through the zoom, the way a frame's label does, and
 * step aside once the frame is too small on screen to hold them.
 */

/** below this width on screen the frame holds no words, only its dashed edge */
const WORDS_FROM = 140;

/** what a designer at work in a placeholder is doing, in a word, and the step it is on */
export interface PlaceholderWork {
	readonly phase: "Reading" | "Drawing" | "Checking";
	readonly detail: string | null;
}

/** the tile of the placeholder's frame in the turn still running, if this canvas has one */
export function tileFor(entries: readonly AgentEntry[], frame: string): AgentTile | undefined {
	for (let at = entries.length - 1; at >= 0; at -= 1) {
		const entry = entries[at];
		if (entry?.kind !== "turn") continue;
		if (entry.ms !== null) return undefined;
		return entry.tiles.find((tile) => tile.frame === frame);
	}
	return undefined;
}

/** what the tile says its designer is doing, while nothing of its frame has landed */
export function workOf(tile: AgentTile | undefined): PlaceholderWork | null {
	if (tile === undefined || (tile.state !== "reading" && tile.state !== "drawing")) return null;
	const step = tile.step?.replace(/^Running\s+/, "").trim() || null;
	if (tile.state === "drawing")
		return { phase: "Drawing", detail: `${tile.lines} ${tile.lines === 1 ? "line" : "lines"}` };
	// the step's first verb says the phase: `Write the frame, then spool check` is drawing
	const said = step?.toLowerCase() ?? "";
	const first = (verbs: RegExp) => said.search(verbs);
	const phases = [
		{ phase: "Drawing" as const, at: first(/\b(write|draw|build|create|make)/) },
		{ phase: "Checking" as const, at: first(/\b(check|shot|verify|review)/) },
	].filter((one) => one.at >= 0);
	const phase = phases.sort((a, b) => a.at - b.at)[0]?.phase ?? "Reading";
	return { phase, detail: step };
}

/** whose designer a teammate's placeholder holds: their account, name, and colour when known */
export interface PlaceholderOwner {
	readonly accountId: string;
	readonly name: string;
	/** their presence colour; null when this canvas has not heard of them, which draws neutral ink */
	readonly color: string | null;
}

export function PlaceholderFrame({
	placeholder,
	camera,
	work,
	pointed,
	owner,
}: {
	placeholder: ProjectedPlaceholder;
	camera: CameraStore;
	/** what its designer is doing, where this canvas's turn or its teammate's presence knows it */
	work: PlaceholderWork | null;
	/** a row in the rail points at it */
	pointed: boolean;
	/** a teammate's placeholder: whose designer it is (#378); absent for this canvas's own */
	owner?: PlaceholderOwner | undefined;
}) {
	const { name, x, y, w, h } = placeholder;
	const edge = useRef<HTMLDivElement | null>(null);
	const words = useRef<HTMLDivElement | null>(null);
	useCameraFollow(
		camera,
		({ k }) => {
			if (edge.current !== null) edge.current.style.borderWidth = `${1 / k}px`;
			const box = words.current;
			if (box === null) return;
			box.style.width = `${w * k}px`;
			box.style.height = `${h * k}px`;
			box.style.transform = `scale(${1 / k})`;
			box.style.visibility = w * k < WORDS_FROM ? "hidden" : "visible";
		},
		[w, h],
	);
	const leaf = name.split("/").pop() ?? name;
	/** a teammate's colour, which their placeholder's edge and marks take */
	const tint = owner?.color ?? undefined;
	return (
		<div
			data-placeholder-frame={name}
			data-placeholder-work={work?.phase.toLowerCase() ?? ""}
			data-placeholder-by={owner?.accountId}
			className="pointer-events-none absolute"
			style={{ transform: `translate(${x}px, ${y}px)`, width: w, height: h }}
		>
			<div
				ref={edge}
				className={cn(
					"absolute inset-0 rounded-[2px] border-dashed transition-colors duration-150",
					pointed ? "border-text" : "border-border-raised",
				)}
				style={tint === undefined || pointed ? undefined : { borderColor: tint }}
			/>
			<div ref={words} className="absolute top-0 left-0 origin-top-left">
				<div className="absolute bottom-full left-0 max-w-full truncate pb-2.5 text-muted type-value">{leaf}</div>
				<div className="flex size-full flex-col gap-2 overflow-hidden p-4">
					{placeholder.title === undefined ? null : (
						<div className="line-clamp-2 text-text type-control">{placeholder.title}</div>
					)}
					{placeholder.brief === undefined ? null : (
						<div className="line-clamp-6 whitespace-pre-line text-muted type-detail">{placeholder.brief}</div>
					)}
					<div className="mt-auto flex min-w-0 items-center gap-2 type-detail">
						{work === null ? (
							owner === undefined ? (
								<span className="text-muted">A designer is drawing this frame</span>
							) : (
								<>
									<span
										data-placeholder-mark=""
										className="size-1.5 shrink-0 bg-muted"
										style={{ borderRadius: 1.8, ...(tint === undefined ? {} : { background: tint }) }}
									/>
									<span className="min-w-0 truncate text-muted">
										{owner.name}'s designer is drawing this frame
									</span>
								</>
							)
						) : (
							<>
								<span
									data-placeholder-live=""
									className="size-1.5 shrink-0 animate-agent-newest bg-text"
									style={{ borderRadius: 1.8, ...(tint === undefined ? {} : { background: tint }) }}
								/>
								{owner === undefined ? null : (
									<span className="shrink-0 text-muted">{owner.name}'s designer</span>
								)}
								<span className="agent-shimmer shrink-0 animate-agent-shimmer text-text">{work.phase}</span>
								{work.detail === null ? null : (
									<span className="min-w-0 truncate text-muted">{work.detail}</span>
								)}
							</>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
