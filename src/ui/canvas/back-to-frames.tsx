import { type RefObject, useEffect, useState } from "react";
import { hotkeyKey } from "../hotkeys";
import { Button } from "../primitives/actions";
import { Kbd } from "../primitives/display";
import { type Box, noneOnScreen } from "./camera";
import type { CameraStore } from "./camera-store";

/**
 * The way back when the camera has been panned off every frame on the page
 * (task 596, `lost-middle`): the empty middle says so and offers the fit ⇧1
 * already does. It is asked only where the camera comes to rest, so a pan
 * passing over empty space never flashes it, and it goes the moment the
 * camera moves again.
 *
 * `field` changes whenever the boxes do, so a frame landing in view, or the
 * last one in view going, is heard without the camera moving.
 */
export function BackToFrames({
	camera,
	viewport,
	boxes,
	field,
	onBack,
}: {
	camera: CameraStore;
	viewport: RefObject<HTMLElement | null>;
	boxes: () => readonly Box[];
	field: unknown;
	onBack: () => void;
}) {
	const [lost, setLost] = useState(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `field` is what changes when the boxes do
	useEffect(() => {
		const ask = (at: ReturnType<CameraStore["get"]>) => {
			const el = viewport.current;
			setLost(at !== null && el !== null && noneOnScreen(at, boxes(), el.clientWidth, el.clientHeight));
		};
		ask(camera.rest());
		return camera.subscribe((at, moving) => {
			if (moving) setLost(false);
			else ask(at);
		});
	}, [camera, viewport, boxes, field]);

	if (!lost) return null;
	return (
		<div
			data-back-to-frames=""
			className="pointer-events-none absolute inset-0 flex animate-place-in flex-col items-center justify-center gap-3 pb-20"
		>
			<p className="text-tertiary type-detail">no frames in view</p>
			<Button
				size="sm"
				className="pointer-events-auto gap-2 pr-1"
				onClick={onBack}
				// a press here is the button's, never the start of a marquee or a pan on the field under it
				onPointerDown={(event) => event.stopPropagation()}
			>
				Back to frames
				<Kbd>{hotkeyKey("canvas.fit-all")}</Kbd>
			</Button>
		</div>
	);
}
