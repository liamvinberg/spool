// tldraw with the stock UI stripped (hideUi) and spool's own chrome around the bare editor.
// Frames are a custom shape hosting the same srcdoc iframes (the Make Real pattern);
// arrows are tldraw's built-in bound arrows. Snapping flipped to always-on to match Figma.
// No license key → "made with tldraw" watermark. That's the hobby-tier reality; the
// commercial tier is part of this ticket's verdict, not something the spike can hide.

import { useEffect } from "react";
import {
	BaseBoxShapeUtil,
	createShapeId,
	type Editor,
	HTMLContainer,
	Tldraw,
	type TLShape,
	track,
	useEditor,
} from "tldraw";
import "tldraw/tldraw.css";
import { CanvasChrome, type ToolId } from "./canvas-chrome";
import { FrameContent } from "./frame-content";
import type { ScreenId } from "./scene";
import { sceneArrows, sceneFrames } from "./scene";

const LIVE_FRAME = "live-frame";

declare module "tldraw" {
	export interface TLGlobalShapePropsMap {
		[LIVE_FRAME]: { w: number; h: number; name: string; screen: ScreenId };
	}
}

type LiveFrameShape = TLShape<typeof LIVE_FRAME>;

// Counter-scaled label above the frame — same trick as the home-built variant,
// but zoom comes reactively from the editor (track re-renders on camera change).
const FrameLabel = track(function FrameLabel({ shape }: { shape: LiveFrameShape }) {
	const editor = useEditor();
	const z = editor.getZoomLevel();
	const selected = editor.getSelectedShapeIds().includes(shape.id);
	return (
		<div
			style={{
				position: "absolute",
				bottom: "100%",
				left: 0,
				transform: `scale(${1 / z})`,
				transformOrigin: "left bottom",
				whiteSpace: "nowrap",
				paddingBottom: 6,
				fontSize: 12,
				fontWeight: 500,
				color: selected ? "#0d99ff" : "#6f6e77",
			}}
		>
			{shape.props.name}
		</div>
	);
});

class LiveFrameUtil extends BaseBoxShapeUtil<LiveFrameShape> {
	static override type = LIVE_FRAME;

	override getDefaultProps(): LiveFrameShape["props"] {
		return { w: 390, h: 844, name: "frame", screen: "login" };
	}

	override canEdit() {
		return false;
	}

	override component(shape: LiveFrameShape) {
		return (
			<HTMLContainer>
				<FrameLabel shape={shape} />
				<div
					style={{
						width: "100%",
						height: "100%",
						overflow: "hidden",
						background: "#fff",
						boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
					}}
				>
					<FrameContent screen={shape.props.screen} />
				</div>
			</HTMLContainer>
		);
	}

	override getIndicatorPath(shape: LiveFrameShape) {
		const path = new Path2D();
		path.rect(0, 0, shape.props.w, shape.props.h);
		return path;
	}
}

function buildScene(editor: Editor) {
	if (editor.getCurrentPageShapeIds().size > 0) return;
	editor.run(() => {
		editor.createShapes(
			sceneFrames.map((f) => ({
				id: createShapeId(f.id),
				type: LIVE_FRAME,
				x: f.x,
				y: f.y,
				props: { w: f.w, h: f.h, name: f.name, screen: f.screen },
			})),
		);
		for (const a of sceneArrows) {
			const arrowId = createShapeId(a.id);
			editor.createShape({ id: arrowId, type: "arrow", props: { color: "blue", size: "m" } });
			for (const [terminal, target] of [
				["start", a.from],
				["end", a.to],
			] as const) {
				editor.createBinding({
					type: "arrow",
					fromId: arrowId,
					toId: createShapeId(target),
					props: {
						terminal,
						normalizedAnchor: { x: 0.5, y: 0.5 },
						isPrecise: false,
						isExact: false,
						snap: "none",
					},
				});
			}
		}
		editor.selectNone();
	});
}

const isTyping = (t: EventTarget | null) =>
	t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

// hideUi strips tldraw's keyboard shortcuts along with its chrome, so the minimal
// Figma set is rewired here: tools, zoom keys, delete. Nudge/space-pan stay editor-native.
const Chrome = track(function Chrome() {
	const editor = useEditor();
	const anim = { animation: { duration: 140 } };

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (isTyping(e.target)) return;
			const mod = e.metaKey || e.ctrlKey;
			if (mod && (e.key === "=" || e.key === "+")) {
				e.preventDefault();
				editor.zoomIn(undefined, anim);
				return;
			}
			if (mod && e.key === "-") {
				e.preventDefault();
				editor.zoomOut(undefined, anim);
				return;
			}
			if (mod && e.key === "0") {
				e.preventDefault();
				editor.resetZoom(undefined, anim);
				return;
			}
			if (mod) return;
			switch (e.key) {
				case "v":
					editor.setCurrentTool("select");
					break;
				case "h":
					editor.setCurrentTool("hand");
					break;
				case "a":
					editor.setCurrentTool("arrow");
					break;
				case "+":
				case "=":
					editor.zoomIn(undefined, anim);
					break;
				case "-":
					editor.zoomOut(undefined, anim);
					break;
				case "!":
					editor.zoomToFit({ animation: { duration: 220 } });
					break;
				case "@":
					editor.zoomToSelection({ animation: { duration: 220 } });
					break;
				case "Backspace":
				case "Delete":
					editor.deleteShapes(editor.getSelectedShapeIds());
					break;
				case "Escape":
					editor.cancel();
					editor.selectNone();
					break;
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	const toolId = editor.getCurrentToolId();
	const tool: ToolId = toolId === "hand" ? "hand" : toolId === "arrow" ? "arrow" : "select";

	return (
		<CanvasChrome
			tool={tool}
			onTool={(t) => editor.setCurrentTool(t)}
			zoomPct={Math.round(editor.getZoomLevel() * 100)}
			onZoomIn={() => editor.zoomIn(undefined, anim)}
			onZoomOut={() => editor.zoomOut(undefined, anim)}
			onZoomFit={() => editor.zoomToFit({ animation: { duration: 220 } })}
		/>
	);
});

export function VariantTldraw() {
	return (
		<div className="h-full w-full">
			<Tldraw
				hideUi
				shapeUtils={[LiveFrameUtil]}
				onMount={(editor) => {
					editor.user.updateUserPreferences({ isSnapMode: true });
					buildScene(editor);
					editor.zoomToFit();
				}}
			>
				<Chrome />
			</Tldraw>
		</div>
	);
}
