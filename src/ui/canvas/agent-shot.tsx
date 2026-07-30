import { useEffect, useMemo, useState } from "react";
import { attachHotkeyLayer, type HotkeyHandler } from "../hotkey-dispatch";
import type { HotkeyIdFor } from "../hotkeys";
import type { AgentShot } from "./agent-transcript";

/**
 * The picture a tool call handed back, behind that call's disclosure (#117, #194).
 *
 * A screenshot is the payload of a row and not a row of its own, because it is fixed
 * at the one moment it was taken: nothing about it goes on changing after the call
 * that produced it, which is the test a plan passes and this fails. So the row stays
 * one line and the picture hangs under it at 120px — the one payload this rail opens
 * unasked, because a picture is what the agent actually saw.
 *
 * The bytes are already here. A `tool_result` carries roughly 150 KB of base64 PNG
 * straight into memory, so drawing it costs no fetch — and the same 150 KB is why the
 * line above it holds a verb and a frame name instead.
 */

/**
 * How wide the thumbnail is.
 *
 * The width the rail has left once the transcript's padding and the row's own indent
 * are off it, and wide enough to see that a frame changed.
 */
const SHOT_W = 120;

/**
 * How wide the picture goes when you press it.
 *
 * A phone frame is 390 CSS px and `spool shot` shoots at device scale, so this is the
 * screenshot at roughly life size. 120px says a frame changed; this is where you see
 * what changed, which is the whole reason the press exists.
 */
const BIG_W = 390;

export function Shot({
	shot,
	of,
	quiet,
}: {
	shot: AgentShot;
	/** what the picture is, in the machine's own register: a frame name, or the path */
	of: string | null;
	/**
	 * The line above this already says what the picture is, so the thumbnail says
	 * nothing.
	 *
	 * Every shot in the captures is of the frame its own row names, so `look home` and a
	 * caption reading `home` are one word twice. Held big it is the other way round: the
	 * row is behind the picture and the caption is the only thing saying what this is.
	 */
	quiet: boolean;
}) {
	const [big, setBig] = useState(false);
	/*
	 * Held across renders, because the string is the size of the picture.
	 *
	 * The transcript is projected fresh on every tick of the rail's clock, so this row
	 * re-renders ten times a second while the turn runs — and building a 200 KB data URL
	 * each time would spend two megabytes a second of string on a picture that has not
	 * changed. The bytes are fixed at the moment the shot was taken; the object holding
	 * them is not.
	 */
	const src = useMemo(() => `data:${shot.media};base64,${shot.data}`, [shot.media, shot.data]);
	return (
		<div className="flex flex-col gap-1.5 pt-0.5">
			<button type="button" onClick={() => setBig(true)} className="w-fit cursor-zoom-in">
				{/* the picture's own edge, so a frame in the rail is bounded the way one on the
				    canvas is */}
				<span className="block w-fit overflow-hidden rounded-xs border border-border-raised bg-bg">
					<img src={src} alt={of ?? "screenshot"} width={SHOT_W} className="block h-auto" />
				</span>
			</button>
			{/* which frame, and that is one word: `image/png` is a fact about a file and the
			    row above already said `look` */}
			{quiet || of === null ? null : (
				<span className="truncate font-mono text-2xs text-muted/45 leading-4">{of}</span>
			)}
			<Lightbox open={big} onClose={() => setBig(false)} caption={of}>
				<img src={src} alt={of ?? "screenshot"} width={BIG_W} className="block h-auto max-w-full" />
			</Lightbox>
		</div>
	);
}

/**
 * The picture, held over everything until you put it down.
 *
 * The way out is the way out of everything else: esc leaves an entered frame and stops
 * a running turn, so it leaves this, and the hint says so in the same mono the canvas
 * uses for `live · esc exits`. A press on the backdrop does the same, because clicking
 * away from a thing is how you put it down. There is no ✕ — it would be a third way to
 * do what the first two do, sitting on top of the one thing here worth looking at.
 *
 * It takes the keyboard the way the export dialog and the finder do, by attaching a
 * layer in the `dialog` scope. That scope is exclusive, so while a picture is up it
 * swallows what it does not answer rather than letting `v` change tool underneath it.
 *
 * `fixed` rather than a portal: the canvas fills the window, so this covers it with
 * nothing threaded through the rail to make it happen.
 */
function Lightbox({
	open,
	onClose,
	caption,
	children,
}: {
	open: boolean;
	onClose: () => void;
	/** what this is, in the machine's own register: a frame name, or the path it came from */
	caption: string | null;
	children: React.ReactNode;
}) {
	useEffect(() => {
		if (!open) return;
		return attachHotkeyLayer({
			scope: "dialog",
			handlers: {
				"dialog.close": (event) => {
					event?.preventDefault();
					onClose();
				},
			} satisfies Record<HotkeyIdFor<"dialog">, HotkeyHandler>,
		});
	}, [open, onClose]);

	if (!open) return null;
	return (
		<div
			data-agent-lightbox=""
			className="fixed inset-0 z-50 flex animate-find-in flex-col items-center justify-center gap-3 bg-bg/90 p-10"
		>
			{/* the rest of the screen, which is a press that puts the picture down — behind the
			    picture rather than around it, so the press that lands on the picture is not it */}
			<button
				type="button"
				aria-label="Close picture"
				tabIndex={-1}
				onClick={onClose}
				className="absolute inset-0 cursor-default"
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-label={caption ?? "screenshot"}
				className="relative flex min-h-0 max-w-full items-center justify-center overflow-auto rounded-sm border border-border-raised bg-bg"
			>
				{children}
			</div>
			<span className="relative flex shrink-0 items-center gap-2.5 font-mono text-2xs leading-3">
				{caption === null ? null : <span className="truncate text-muted/55">{caption}</span>}
				<span className="text-muted/35">esc</span>
			</span>
		</div>
	);
}
