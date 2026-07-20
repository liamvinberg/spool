// One frame on the canvas. Renders whatever the lifecycle says:
//   snapshot → thumbnail (or placeholder), no iframe in the DOM
//   warm     → iframe mounted but hidden under the thumbnail (state survives)
//   live     → the real thing; pointer events only when this frame is "entered"
//
// memo'd hard: canvas pans/zooms/drags must never re-render shells — React
// reconciling an iframe with a changed srcDoc reloads it and resets its state.

import { memo } from "react";
import { DOCS } from "./docs";
import type { FrameState } from "./lifecycle";

const KIND_HUES: Record<string, string> = {
	login: "#e7e3f6",
	clock: "#e3ecf6",
	habit: "#e3f6ea",
	statsdesk: "#f6efe3",
	buttons: "#f6e3ee",
	todo: "#eef6e3",
	particles: "#2a2740",
	ticker: "#e3f4f6",
	livechart: "#f0e3f6",
};

export const FrameShell = memo(function FrameShell({
	id,
	name,
	kind,
	state,
	interacting,
	shot,
	onIframe,
}: {
	id: string;
	name: string;
	kind: string;
	state: FrameState;
	interacting: boolean;
	shot: string | undefined;
	onIframe: (id: string, el: HTMLIFrameElement | null) => void;
}) {
	return (
		<>
			{state !== "snapshot" && (
				<iframe
					ref={(el) => onIframe(id, el)}
					title={name}
					sandbox="allow-scripts"
					srcDoc={DOCS[id]}
					style={{
						display: "block",
						width: "100%",
						height: "100%",
						border: 0,
						background: "#fff",
						pointerEvents: interacting ? "auto" : "none",
						visibility: state === "warm" ? "hidden" : "visible",
					}}
				/>
			)}
			{state !== "live" &&
				(shot ? (
					<img
						src={shot}
						alt={name}
						draggable={false}
						style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
					/>
				) : (
					<div
						className="absolute inset-0 flex items-center justify-center"
						style={{ background: KIND_HUES[kind] ?? "#eee" }}
					>
						<div className="text-[13px] font-medium opacity-50" style={{ color: kind === "particles" ? "#fff" : "#1a1523" }}>
							{name}
						</div>
					</div>
				))}
			{!interacting && <div className="absolute inset-0" />}
		</>
	);
});
