import { type MouseEvent, useEffect, useRef, useState } from "react";
import { cn } from "../cn";
import { desktopWindow } from "../desktop-window";
import { CheckIcon } from "../icons";
import { Button, IconButton } from "../primitives/actions";
import { Kbd } from "../primitives/display";
import { FLOATING } from "../primitives/overlays";
import { useSetting } from "../settings";
import { displayCount, type PresentFrom, presentDeck, presentTakes, warmPresent } from "./present";
import { type PresentHow, type PresentWay, wayPresentTakes } from "./present-way";

/**
 * Present's own controls (spool#298, the team canvas's `app/spool-deck--present-menu` and `--slides`): Present with its
 * caret at the canvas's top right, and the bar that comes up under a moving hand while the slides fill the screen.
 * Everything moves on transitions, never keyframes, so a control reversed mid-way turns round where it is.
 */

function PlayGlyph() {
	return (
		<svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
			<path d="M5 3.6v8.8L12.2 8Z" fill="currentColor" />
		</svg>
	);
}

function Chevron({ back = false }: { back?: boolean }) {
	return (
		<svg viewBox="0 0 16 16" className={cn("size-4", back && "rotate-180")} fill="none" aria-hidden="true">
			<path
				d="m6 3.5 4.5 4.5L6 12.5"
				stroke="currentColor"
				strokeWidth="1.4"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function Caret() {
	return (
		<svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden="true">
			<path
				d="m3 4.75 3 3 3-3"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** Where spool runs, which changes what the presenter view does with the room on one display. */
export type PresentShell = "mac" | "browser";

/** What each way is called, and what it does here. */
export const WAYS: Record<PresentWay, { title: string; said: (displays: 1 | 2, shell: PresentShell) => string }> = {
	slides: {
		title: "Full screen",
		said: (displays) => (displays === 2 ? "The slides on both screens." : "The slides fill this screen."),
	},
	presenter: {
		title: "Presenter view",
		said: (displays, shell) =>
			displays === 2
				? "Your notes here, the room on the other display."
				: shell === "mac"
					? "Your notes here, the room in a window beside it."
					: "Your notes in this tab, the room in a window over it.",
	},
};

/**
 * Present with a caret joined to it, at the canvas's top right. Present plays at once, the way it will take (`way`):
 * two displays, always the presenter view; one, the way used last. The caret opens the two ways drawn small, in a
 * fixed order; the one Present takes wears the check and ⌘↵, the other ⌥⌘↵. The hand on its way to Present readies
 * the slide it plays from (`onWarm`).
 */
export function PresentSplit({
	way,
	displays,
	shell,
	onPresent,
	onWarm,
}: {
	way: PresentWay;
	displays: 1 | 2;
	shell: PresentShell;
	onPresent: (how: PresentHow) => void;
	onWarm: () => void;
}) {
	const [open, setOpen] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const away = (event: PointerEvent) => {
			if (box.current?.contains(event.target as Node) === true) return;
			setOpen(false);
		};
		const key = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopImmediatePropagation();
			setOpen(false);
		};
		window.addEventListener("pointerdown", away, true);
		window.addEventListener("keydown", key, true);
		return () => {
			window.removeEventListener("pointerdown", away, true);
			window.removeEventListener("keydown", key, true);
		};
	}, [open]);
	return (
		<div ref={box} data-present-split="" className="relative" onPointerEnter={onWarm}>
			<div className="flex h-control-sm items-center rounded-xs border border-line-strong bg-surface-canvas">
				<Button
					variant="ghost"
					size="sm"
					icon={<PlayGlyph />}
					title={`Present · ${WAYS[way].title} ⌘↵`}
					onClick={() => {
						setOpen(false);
						onPresent("present");
					}}
					className="h-full rounded-r-none border-0 pr-2 pl-1.5 text-primary enabled:active:scale-[0.97]"
				>
					Present
				</Button>
				<span aria-hidden="true" className="h-3.5 w-px bg-line-strong" />
				<IconButton
					size="sm"
					icon={<Caret />}
					label="Ways to present"
					aria-expanded={open}
					onClick={() => setOpen((one) => !one)}
					className="h-full w-6 rounded-l-none border-0 enabled:active:scale-100"
				/>
			</div>
			<div
				role="menu"
				data-open={open ? "" : undefined}
				className={cn(
					"absolute top-full right-0 mt-1.5 flex w-[376px] origin-top-right flex-col rounded-md p-1",
					FLOATING,
					"pointer-events-none scale-[0.97] opacity-0 transition-[opacity,scale] duration-quick ease-out",
					"data-open:pointer-events-auto data-open:scale-100 data-open:opacity-100 data-open:duration-fast",
				)}
			>
				{(["slides", "presenter"] as const).map((mode) => (
					<button
						key={mode}
						type="button"
						role="menuitemradio"
						aria-checked={mode === way}
						tabIndex={open ? 0 : -1}
						onClick={() => {
							setOpen(false);
							onPresent({ picked: mode });
						}}
						className="flex w-full items-center gap-2.5 rounded-sm py-2 pr-2 pl-1.5 text-left transition-colors duration-fast ease-out focus-ring-inset hover:bg-state-hover-raised active:bg-state-pressed"
					>
						<span className="flex w-3 shrink-0 justify-center text-primary">
							{mode === way ? <CheckIcon className="size-3" /> : null}
						</span>
						<WayDrawing mode={mode} two={displays === 2} />
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="text-primary type-control">{WAYS[mode].title}</span>
							<span className="text-secondary type-caption">{WAYS[mode].said(displays, shell)}</span>
						</span>
						<Kbd>{mode === way ? "⌘↵" : "⌥⌘↵"}</Kbd>
					</button>
				))}
			</div>
		</div>
	);
}

/**
 * Present on a deck page, at the canvas's top right: plays from what `from` says when pressed (the slide held, else the
 * first), the way the displays and the way remembered say.
 */
export function PresentControl({ from }: { from: () => PresentFrom | undefined }) {
	const remembered = useSetting("present.way") === "presenter" ? "presenter" : "slides";
	const displays = displayCount();
	return (
		<PresentSplit
			way={wayPresentTakes(displays, remembered)}
			displays={displays}
			shell={desktopWindow() === undefined ? "browser" : "mac"}
			onPresent={(how) => {
				const at = from();
				if (at !== undefined) presentDeck(at, how);
			}}
			onWarm={() => {
				const at = from();
				if (at !== undefined && presentTakes() === "slides") warmPresent(at);
			}}
		/>
	);
}

/** Each way, drawn small: the screens it uses and what is on them. */
function WayDrawing({ mode, two }: { mode: PresentWay; two: boolean }) {
	return (
		<svg viewBox="0 0 48 30" className="h-[30px] w-12 shrink-0 text-tertiary" fill="none" aria-hidden="true">
			<rect x="0.5" y="0.5" width={two ? 30 : 47} height={two ? 20 : 29} rx="2.5" stroke="currentColor" />
			{mode === "slides" ? (
				<rect
					x={two ? 3 : 4}
					y={two ? 4 : 5}
					width={two ? 25 : 40}
					height={two ? 13 : 20}
					rx="1"
					fill="currentColor"
					opacity="0.7"
				/>
			) : (
				<>
					<rect x="3" y="4" width={two ? 15 : 26} height={two ? 9 : 15} rx="1" fill="currentColor" opacity="0.7" />
					<path
						d={two ? "M21 5h7M21 8h7M21 11h5" : "M33 6h11M33 10h11M33 14h7"}
						stroke="currentColor"
						strokeLinecap="round"
					/>
				</>
			)}
			{two ? (
				<rect
					x="33.5"
					y="9.5"
					width="14"
					height="9"
					rx="1.5"
					stroke="currentColor"
					fill="currentColor"
					fillOpacity="0.35"
				/>
			) : mode === "presenter" ? (
				<rect
					x="31"
					y="19"
					width="14"
					height="8"
					rx="1"
					stroke="currentColor"
					fill="currentColor"
					fillOpacity="0.35"
				/>
			) : null}
		</svg>
	);
}

/** How long a peek stays after the pointer leaves it, so an edge never flickers. */
const PEEK_GRACE_MS = 160;

/** A peek that opens with the pointer over its door or itself, and stays a moment after it leaves. */
function usePeek(pinned: boolean) {
	const [over, setOver] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => () => clearTimeout(timer.current), []);
	const enter = () => {
		clearTimeout(timer.current);
		setOver(true);
	};
	const leave = () => {
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setOver(false), PEEK_GRACE_MS);
	};
	return { open: over || pinned, hover: { onPointerEnter: enter, onPointerLeave: leave } };
}

export interface PresentBarProps {
	/** the hand moved, and has not rested since */
	awake: boolean;
	/** where the talk is: the slide, from 0, of how many */
	slide: number;
	slides: number;
	/** the notes for the beat showing, and what heads them */
	head: string;
	note: string;
	pinned: boolean;
	onPinned: (pinned: boolean) => void;
	onBack: () => void;
	onNext: () => void;
	onEnd: () => void;
	/** the bar is under the pointer: it stays */
	onHeld: (held: boolean) => void;
}

/**
 * The bar over the slides while they fill the screen: one small bar at the foot, there only while the hand moves (or
 * rests on it). Back, where the talk is, next; Notes, a peek at what to say over this beat, which opens under the
 * pointer and pins with a press; End. A press here leaves the keys where they were.
 */
export function PresentBar({
	awake,
	slide,
	slides,
	head,
	note,
	pinned,
	onPinned,
	onBack,
	onNext,
	onEnd,
	onHeld,
}: PresentBarProps) {
	const peek = usePeek(pinned);
	const shown = awake || pinned;
	const keepFocus = (event: MouseEvent) => event.preventDefault();
	return (
		<div
			role="toolbar"
			aria-label="The talk"
			data-present-bar={shown ? "awake" : "asleep"}
			className={cn(
				"absolute bottom-16 left-1/2 flex -translate-x-1/2 flex-col items-center transition-[opacity,translate] ease-out",
				shown
					? "pointer-events-auto opacity-100 duration-base"
					: "pointer-events-none translate-y-1.5 opacity-0 duration-slower",
			)}
			onPointerEnter={() => onHeld(true)}
			onPointerLeave={() => onHeld(false)}
			onMouseDown={keepFocus}
		>
			<div
				{...peek.hover}
				data-present-notes={peek.open ? "open" : "closed"}
				className={cn(
					"mb-2 w-[440px] origin-bottom rounded-lg border border-line-strong bg-surface-raised px-4 pt-3 pb-4",
					"transition-[opacity,scale,translate] ease-out",
					peek.open
						? "scale-100 opacity-100 duration-fast"
						: "pointer-events-none translate-y-1 scale-[0.97] opacity-0 duration-base",
				)}
			>
				<div className="flex h-5 items-center gap-2 text-secondary type-detail">
					<span>notes</span>
					<span className="truncate text-tertiary">{head}</span>
				</div>
				<p className="mt-1.5 text-primary type-body">
					{note === "" ? <span className="text-tertiary">No notes for this beat.</span> : note}
				</p>
			</div>
			<div className="flex h-10 items-center gap-0.5 rounded-lg border border-line-strong bg-surface-raised p-1">
				<IconButton icon={<Chevron back />} label="Back ←" onClick={onBack} />
				<span className="min-w-[64px] px-1 text-center text-secondary tabular-nums type-value">
					{slide + 1} of {slides}
				</span>
				<IconButton icon={<Chevron />} label="Next →" onClick={onNext} />
				<span aria-hidden="true" className="mx-1 h-4 w-px bg-line-strong" />
				<span {...peek.hover}>
					<Button
						variant="ghost"
						size="sm"
						aria-pressed={pinned}
						onClick={() => onPinned(!pinned)}
						className="aria-pressed:bg-state-selected-strong aria-pressed:text-primary"
					>
						Notes
					</Button>
				</span>
				<Button variant="ghost" size="sm" onClick={onEnd} title="End the talk · esc">
					End
				</Button>
			</div>
		</div>
	);
}

/** Notes' head for a beat: its place among the slide's beats and its name, or the slide's name for a slide of one. */
export function notesHead(frame: string, beats: readonly string[], beat: number): string {
	return beats.length > 1 ? `${beat + 1} of ${beats.length} · ${beats[beat] ?? ""}` : nameOf(frame);
}

export const nameOf = (frame: string): string => frame.slice(frame.lastIndexOf("/") + 1);
