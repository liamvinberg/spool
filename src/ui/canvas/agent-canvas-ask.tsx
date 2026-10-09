import { useLayoutEffect, useRef } from "react";
import type { AgentReply } from "../../daemon/agent-control";
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
/** the gap between the frame's foot and the card's notch */
const BELOW = 22;
/** the notch, over the companion that sits at the frame's left foot */
const NOTCH = 15;

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
			const rect = toScreen(box.current, view);
			element.style.visibility = "";
			element.style.transform = `translate(${Math.round(rect.x)}px, ${Math.round(rect.y + rect.h + BELOW)}px)`;
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
		const rect = toScreen(frame, view);
		element.style.transform = `translate(${Math.round(rect.x)}px, ${Math.round(rect.y + rect.h + BELOW)}px)`;
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
			<AskCard entry={entry} ask={ask} notch={NOTCH / WIDTH} float />
		</div>
	);
}
