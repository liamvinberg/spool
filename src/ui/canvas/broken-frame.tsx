import { memo, useRef } from "react";
import type { BrokenFrame as Broken } from "../../daemon/thumbs";
import { Button } from "../primitives/actions";
import { type Box, type NearScreen, shellRadius } from "./camera";
import { type CameraStore, useCameraFollow } from "./camera-store";

/**
 * A frame that does not compile or throws as it starts, drawn over its last
 * good picture (spool-canvas--broken). The picture stays, dimmed well down, so
 * the screen is still the one you know and nobody takes it for working. The
 * edge is danger, and the label above says it in the same ink, which is all a
 * frame zoomed out has room for. Once it stands wide enough on screen to read,
 * it says why in the toolchain's own words and offers the one act that fixes
 * it. The panel holds one size on screen through the zoom, as a label does, so
 * the words never shrink to a smudge or swell past the frame.
 */

/** How wide a frame stands on screen before its panel is worth reading. */
const READABLE_PX = 200;
/** The panel's inset from the frame's edge, on screen. */
const INSET_PX = 8;

export const BrokenFrame = memo(function BrokenFrame({
	name,
	frame,
	broken,
	camera,
	near,
	act,
	onAct,
}: {
	name: string;
	/** the frame, in world units */
	frame: Box;
	broken: Broken;
	camera: CameraStore;
	near: NearScreen;
	/** what the act says: "Ask agent to fix", or "Copy prompt" with no agent on this machine */
	act: string;
	onAct: (name: string, broken: Broken) => void;
}) {
	const edge = useRef<HTMLDivElement | null>(null);
	const panel = useRef<HTMLDivElement | null>(null);
	useCameraFollow(
		camera,
		(at, moving) => {
			if (moving && !near(at, frame)) return;
			const { k } = at;
			if (edge.current !== null) {
				edge.current.style.borderWidth = `${1 / k}px`;
				edge.current.style.borderRadius = `${shellRadius(k)}px`;
			}
			const box = panel.current;
			if (box === null) return;
			const readable = frame.w * k >= READABLE_PX;
			box.style.display = readable ? "" : "none";
			if (!readable) return;
			box.style.width = `${frame.w * k}px`;
			box.style.height = `${frame.h * k}px`;
			box.style.transform = `scale(${1 / k})`;
		},
		[frame.x, frame.y, frame.w, frame.h, near],
	);
	return (
		<div
			data-broken-frame={name}
			className="pointer-events-none absolute"
			style={{ transform: `translate(${frame.x}px, ${frame.y}px)`, width: frame.w, height: frame.h }}
		>
			<div ref={edge} className="absolute inset-0 border-danger border-solid bg-surface-canvas/80" />
			<div ref={panel} className="absolute top-0 left-0 origin-top-left">
				<div
					className="flex flex-col gap-3 overflow-hidden rounded-sm bg-surface-panel p-3"
					style={{ margin: INSET_PX, maxHeight: `calc(100% - ${INSET_PX * 2}px)` }}
				>
					<span className="text-danger-strong type-value">
						{broken.kind === "compile" ? "failed to compile" : "threw on boot"}
					</span>
					<pre className="line-clamp-[10] whitespace-pre-wrap break-words text-secondary type-detail">
						{said(broken)}
					</pre>
					<div>
						<Button
							size="sm"
							className="pointer-events-auto"
							// the canvas under it would take the press as the start of a drag
							onPointerDown={(event) => event.stopPropagation()}
							onDoubleClick={(event) => event.stopPropagation()}
							onClick={(event) => {
								event.stopPropagation();
								onAct(name, broken);
							}}
						>
							{act}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
});

/** The error as the frame's own: a throw's words without the booth's prefix, which the status line already says. */
function said(broken: Broken): string {
	return broken.kind === "boot" ? broken.error.replace(/^threw on boot: /u, "") : broken.error;
}

/** What Ask agent to fix sends: the frame, what broke, the toolchain's words, and how to know it is fixed. */
export function brokenAsk(frame: string, broken: Broken): string {
	const what = broken.kind === "compile" ? "fails to compile" : "throws as it starts";
	return [
		`The frame ${frame} (design/frames/${frame}/frame.tsx) ${what} on the canvas:`,
		"",
		said(broken),
		"",
		`Fix it, then run \`spool check design/frames/${frame}\` and \`spool shot ${frame}\` to confirm it compiles and boots.`,
	].join("\n");
}
