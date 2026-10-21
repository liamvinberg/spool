import { memo, useLayoutEffect, useSyncExternalStore } from "react";
import { pageName } from "../../page-path";
import type { Box, NearScreen } from "../canvas/camera";
import type { CameraStore } from "../canvas/camera-store";
import { ShellClip } from "../canvas/frame-shell";
import { PictureCanvas, type PictureClaims } from "../canvas/picture-canvas";
import type { PictureFrame } from "../canvas/picture-layer";
import { SpinRing } from "../primitives/display";
import type { FieldDocuments } from "./viewer-documents";

/**
 * One frame on the read-only canvas's field. A frame standing as its picture has no shell: the picture layer draws
 * it (`PictureCanvas`). Anything else does: a frame with no picture stands as its placeholder, its name on the
 * frame's surface, and a live frame holds its documents, each booting out of sight and shown once it has arrived.
 *
 * Over a picture the shell is see-through until then, so the picture goes on standing for the frame while its
 * document boots behind it, and the shell takes the frame from the layer the moment one is shown (`PictureClaims`):
 * the layer draws without it before that paint, so the frame is never drawn twice or not at all. A placeholder
 * whose document is on its way says so with a turning ring.
 *
 * The shell takes no pointer of its own: a press is the field's, which finds the frame under it by where it is
 * in the world, so a frame standing as its picture answers it the same.
 */
export const FieldFrame = memo(function FieldFrame({
	frame,
	camera,
	near,
	pictured,
	cover,
	documents,
	claims,
}: {
	frame: Box & { name: string };
	camera: CameraStore;
	near: NearScreen;
	/** Whether the picture layer draws this frame's picture. */
	pictured: boolean;
	/** Its picture's address, drawn here as an image when the layer can't draw (no WebGL2, or a lost context). */
	cover: string | undefined;
	documents: FieldDocuments;
	claims: PictureClaims;
}) {
	const { name } = frame;
	const entry = useSyncExternalStore(documents.subscribe, () => documents.entry(name));
	const shown = entry?.shown === true;
	useLayoutEffect(() => {
		if (!shown) return;
		claims.claim(name, true);
		return () => claims.claim(name, false);
	}, [claims, name, shown]);
	if (pictured && (entry === undefined || entry.documents.length === 0)) return null;
	const newest = entry?.documents.at(-1)?.revision;
	return (
		<div
			className="absolute"
			data-viewer-frame={name}
			data-viewer-shown={shown ? "" : undefined}
			style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}
		>
			<ShellClip camera={camera} near={near} frame={frame}>
				{pictured ? null : cover !== undefined ? (
					<img
						src={cover}
						alt=""
						draggable={false}
						data-viewer-cover=""
						className="absolute inset-0 h-full w-full bg-surface-panel object-contain object-left-top"
					/>
				) : (
					<div
						data-viewer-placeholder=""
						className="absolute inset-0 flex items-center justify-center gap-2 bg-surface-panel"
					>
						<span className="text-secondary type-value">{pageName(name)}</span>
						{entry?.loading === true && <SpinRing data-viewer-loading="" className="size-3 text-secondary" />}
					</div>
				)}
				{entry?.documents.map((document) => (
					<iframe
						key={document.revision}
						ref={(iframe) => documents.attach(name, document.revision, iframe)}
						src={document.src}
						title={document.revision === newest ? name : `${name}, before`}
						data-viewer-revision={document.revision}
						data-viewer-phase={document.phase}
						sandbox="allow-scripts"
						className="pointer-events-none absolute inset-0 h-full w-full border-0 bg-white"
						style={{ opacity: document.phase === "arrived" ? 1 : 0 }}
						tabIndex={-1}
					/>
				))}
			</ShellClip>
		</div>
	);
});

/** The picture layer under the field, told whether a document is booting by the documents rather than a render. */
export function FieldPictures({
	documents,
	...layer
}: {
	camera: CameraStore;
	frames: readonly PictureFrame[];
	claims: PictureClaims;
	documents: FieldDocuments;
	onDrawing: (drawing: boolean) => void;
}) {
	const booting = useSyncExternalStore(documents.subscribe, () => documents.booting);
	return <PictureCanvas {...layer} booting={booting} />;
}
