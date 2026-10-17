import { useRef } from "react";
import type { ProjectedPlaceholder } from "../../daemon/projection";
import { cn } from "../cn";
import { type CameraStore, useCameraFollow } from "./camera-store";
import { type FrameAgent, FrameAgentsMark } from "./frame-agents";

/**
 * A placeholder frame on the canvas (#369): the frame spool made for a designer the moment
 * it started, dashed until its frame.tsx lands. It is its edge and its name row, nothing
 * inside (task 164): the row says an agent is at work there the way a frame's does, and holds
 * one size on screen through the zoom, so nothing in the frame reflows as the zoom moves. A
 * teammate's placeholder (#378) is drawn in their colour. When the source lands the
 * projection lists it as a frame in the same place, and this goes.
 */

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
	agents,
	pointed,
	owner,
}: {
	placeholder: ProjectedPlaceholder;
	camera: CameraStore;
	/** the agents at it, as this canvas's turn or a teammate's presence tells */
	agents: readonly FrameAgent[] | undefined;
	/** a row in the rail points at it */
	pointed: boolean;
	/** a teammate's placeholder: whose designer it is (#378); absent for this canvas's own */
	owner?: PlaceholderOwner | undefined;
}) {
	const { name, x, y, w, h } = placeholder;
	const edge = useRef<HTMLDivElement | null>(null);
	const row = useRef<HTMLDivElement | null>(null);
	useCameraFollow(
		camera,
		({ k }) => {
			if (edge.current !== null) edge.current.style.borderWidth = `${1 / k}px`;
			const box = row.current;
			if (box === null) return;
			box.style.width = `${w * k}px`;
			box.style.transform = `scale(${1 / k})`;
		},
		[w, h],
	);
	const leaf = name.split("/").pop() ?? name;
	/** a teammate's colour, which their placeholder's edge takes */
	const tint = owner?.color ?? undefined;
	return (
		<div
			data-placeholder-frame={name}
			data-placeholder-by={owner?.accountId}
			className="pointer-events-none absolute"
			style={{ transform: `translate(${x}px, ${y}px)`, width: w, height: h }}
		>
			<div
				ref={edge}
				className={cn(
					"absolute inset-0 rounded-[2px] border-dashed transition-colors duration-150",
					pointed ? "border-primary" : "border-line-strong",
				)}
				style={tint === undefined || pointed ? undefined : { borderColor: tint }}
			/>
			<div ref={row} className="@container/row absolute top-0 left-0 origin-top-left">
				<div className="absolute bottom-full left-0 flex w-full min-w-0 items-center gap-1.5 whitespace-nowrap pb-2.5">
					<span className="min-w-0 truncate text-secondary type-value">{leaf}</span>
					<FrameAgentsMark name={name} agents={agents} />
				</div>
			</div>
		</div>
	);
}
