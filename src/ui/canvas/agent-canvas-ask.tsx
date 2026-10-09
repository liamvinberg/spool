import { useLayoutEffect, useRef } from "react";
import type { AgentReply } from "../../daemon/agent-control";
import type { Camera } from "../api";
import { AskCard, type AskEntry, useAsk } from "./agent-ask-view";
import { type Box, toScreen } from "./camera";
import type { CameraStore } from "./camera-store";

/**
 * The ask, standing on the canvas while the rail is shut (#366): under the frame it is
 * about, its notch pointing up at the companion that hangs it, the same answers in it as
 * in the rail. Held at one size on screen whatever the zoom, so it reads and presses the
 * same everywhere, and moved with the camera without a render.
 */

/** the card's width on screen, as wide as the rail's own block */
const WIDTH = 360;

/**
 * Where the card hangs off its frame's left foot, in screen pixels: its top edge `below`
 * the foot, and its notch centred `notch` in, whose tip is `tip` below the foot. The
 * companion that hangs the ask stands on that tip (`agent-companion-layer`).
 */
export const HANG = { below: 22, notch: 15, tip: 14 } as const;

/** the card's place on screen, under its frame as the camera shows it */
function hang(element: HTMLElement, frame: Box, view: Camera): void {
	const rect = toScreen(frame, view);
	element.style.transform = `translate(${Math.round(rect.x)}px, ${Math.round(rect.y + rect.h + HANG.below)}px)`;
}

export function CanvasAsk({
	camera,
	frame,
	entry,
	onAnswer,
}: {
	camera: CameraStore;
	/** the frame the ask is about, in canvas units */
	frame: Box;
	entry: AskEntry;
	onAnswer: (request: string, reply: AgentReply) => void;
}) {
	const ask = useAsk(entry, onAnswer);
	const card = useRef<HTMLDivElement | null>(null);
	const box = useRef(frame);
	box.current = frame;

	useLayoutEffect(() => {
		const place = () => {
			const view = camera.get();
			const element = card.current;
			if (element === null) return;
			if (view === null) {
				element.style.visibility = "hidden";
				return;
			}
			element.style.visibility = "";
			hang(element, box.current, view);
		};
		place();
		return camera.subscribe(place);
	}, [camera]);
	// a frame that moved under a still camera moves its card too
	// biome-ignore lint/correctness/useExhaustiveDependencies: the box is read through its ref
	useLayoutEffect(() => {
		const view = camera.get();
		const element = card.current;
		if (view === null || element === null) return;
		hang(element, frame, view);
	}, [frame.x, frame.y, frame.w, frame.h]);

	return (
		<div
			ref={card}
			data-agent-canvas-ask=""
			className="pointer-events-auto absolute top-0 left-0"
			style={{ width: WIDTH }}
			onPointerDown={(event) => event.stopPropagation()}
			onWheel={(event) => event.stopPropagation()}
		>
			<AskCard entry={entry} ask={ask} notch={HANG.notch / WIDTH} float />
		</div>
	);
}
