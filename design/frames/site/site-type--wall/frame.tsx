import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { SpoolMark } from "../../../shared/ui/spool-mark";

/**
 * site-type--wall. The landing built out of words at architectural size.
 *
 * The argument: getting started is a sequence of moments, so the page is a
 * sequence of rooms. Each room is exactly one viewport, holds one phrase set
 * between 148 and 192px, and carries its machine text on the baseline at the
 * foot. Nothing is centered, nothing is decorated, and there is no picture of
 * the product anywhere on the page. The type is the whole surface.
 *
 * Scale is the only hierarchy and it barely moves: the display sizes sit within
 * one octave of each other, so the reading is horizontal, room to room, rather
 * than a shrinking cone down one page. Rhythm comes from line count instead,
 * two lines then three then four, and from the fixed foot, which never changes
 * position, so the eye lands in the same place every time the wall turns over.
 *
 * The accent appears twice per room at most: the mono machine line at the foot,
 * and the one token inside the display type that a person types verbatim.
 * Snap is mandatory because a room is the unit; the counter and the right-hand
 * rule are the only chrome, and both are position, not ornament.
 */

const VIEW_H = 900;
const PAD_X = 64;

interface Room {
	/** display lines, hand-set: the stage is a fixed width so the breaks are ours */
	lines: readonly string[];
	/** display size in px */
	size: number;
	/** the token inside the display type that is machine text, painted thread */
	accent?: string;
	/** the human sentence at the foot, left */
	note: string;
	/** the machine text at the foot, right, verbatim lowercase mono */
	mono: string;
	/** the plate room carries the video instead of a foot */
	plate?: { file: string; run: string; caption: string };
}

const ROOMS: readonly Room[] = [
	{
		lines: ["It starts as", "one command."],
		size: 192,
		note: "spool runs on your own machine. Node 22 and up, and the canvas wants Chrome.",
		mono: "npm i -g spool.page",
	},
	{
		lines: ["Or a DMG you", "drag to", "Applications."],
		size: 168,
		note: "The Mac app is the same spool in a window. Download one file, drag it across, open it.",
		mono: "spool.dmg",
	},
	{
		lines: ["The first run", "is an empty", "canvas."],
		size: 176,
		note: "There is a window, a rail and a field, and nothing in any of them. That is the correct first screen.",
		mono: "~ $ spool",
	},
	{
		lines: ["Press + and", "hand it a", "folder."],
		size: 176,
		accent: "+",
		note: "Any folder on your disk becomes a project. spool writes design/ beside your source and opens its tab.",
		mono: "~/kaffe/design/frames/",
	},
	{
		lines: ["Then another,", "and another."],
		size: 180,
		note: "Projects stand side by side in one window. Each is a tab, and moving between them is a click.",
		mono: "spool · kaffe · tidemark",
	},
	{
		lines: ["Watch it once."],
		size: 148,
		note: "An empty folder to a walkable flow, start to finish, at the speed it actually happens.",
		mono: "06:12",
		plate: {
			file: "get-started.mp4",
			run: "06:12",
			caption: "An empty folder, a project, a frame, a flow you can walk.",
		},
	},
	{
		lines: ["This page was", "drawn in it."],
		size: 176,
		note: "spool's own design folder holds 142 frames across twelve pages. This page is one of them.",
		mono: "design/frames/site/",
	},
	{
		lines: ["Fork it,", "rework it,", "rename it,", "ship it."],
		size: 148,
		note: "I made this for myself. It's MIT, so make it yours.",
		mono: "github.com/liamvinberg/spool",
	},
];

/** paint the one machine token inside a display line, leaving the rest alone. */
function DisplayLine({ text, accent }: { text: string; accent?: string }) {
	if (accent === undefined || !text.includes(accent)) return <>{text}</>;
	const at = text.indexOf(accent);
	return (
		<>
			{text.slice(0, at)}
			<span className="font-mono text-thread">{accent}</span>
			{text.slice(at + accent.length)}
		</>
	);
}

function Foot({ room }: { room: Room }) {
	return (
		<div className="shrink-0">
			<div className="h-px w-full bg-border" />
			<div className="flex items-start justify-between gap-16 pt-5">
				<p className="max-w-[620px] text-[16px] text-muted leading-[25px]">{room.note}</p>
				<span className="shrink-0 font-mono text-[15px] text-thread leading-[25px]">{room.mono}</span>
			</div>
		</div>
	);
}

/** the video, drawn the way the rest of the page is drawn: a rule and a label. */
function Plate({ plate }: { plate: NonNullable<Room["plate"]> }) {
	return (
		<div className="shrink-0">
			<div className="group relative h-[318px] w-full border border-border">
				<div className="absolute inset-0 flex items-center justify-center">
					<button
						type="button"
						className="flex items-center gap-4 font-mono text-[15px] text-muted transition-colors duration-200 hover:text-text"
					>
						<span className="flex h-11 w-11 items-center justify-center rounded-full border border-border-raised text-thread transition-colors duration-200 group-hover:border-thread">
							<span className="ml-[3px] block text-[13px] leading-none">▶</span>
						</span>
						{plate.file}
					</button>
				</div>
				<span className="absolute right-5 bottom-4 font-mono text-[13px] text-muted">{plate.run}</span>
			</div>
			<p className="pt-4 text-[15px] text-muted leading-[24px]">{plate.caption}</p>
		</div>
	);
}

function RoomBlock({
	room,
	index,
	scroller,
}: {
	room: Room;
	index: number;
	scroller: React.RefObject<HTMLDivElement | null>;
}) {
	const ref = useRef<HTMLDivElement | null>(null);
	const [seen, setSeen] = useState(index === 0);

	useEffect(() => {
		const el = ref.current;
		const root = scroller.current;
		if (el === null || root === null || seen) return;
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) if (e.isIntersecting) setSeen(true);
			},
			{ root, threshold: 0.35 },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [scroller, seen]);

	return (
		<section
			ref={ref}
			className="flex snap-start flex-col"
			style={{ height: VIEW_H, paddingLeft: PAD_X, paddingRight: PAD_X, paddingTop: 118, paddingBottom: 56 }}
		>
			{/* the mass sits on the foot rule; the air is above it, never under it */}
			<div className="flex min-h-0 flex-1 items-end pb-[66px]">
				<h2
					className={cn(
						"font-semibold transition-[opacity,transform] duration-[820ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
						seen ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
					)}
					style={{ fontSize: room.size, lineHeight: 0.88, letterSpacing: "-0.04em" }}
				>
					{room.lines.map((line, i) => (
						<span key={line} className="block whitespace-nowrap" style={{ transitionDelay: `${i * 45}ms` }}>
							<DisplayLine text={line} accent={room.accent} />
						</span>
					))}
				</h2>
			</div>
			{room.plate === undefined ? <Foot room={room} /> : <Plate plate={room.plate} />}
		</section>
	);
}

export default function SiteTypeWall() {
	const scroller = useRef<HTMLDivElement | null>(null);
	const bar = useRef<HTMLDivElement | null>(null);
	const [room, setRoom] = useState(0);

	const onScroll = useCallback(() => {
		const el = scroller.current;
		if (el === null) return;
		const max = el.scrollHeight - el.clientHeight;
		const p = max > 0 ? el.scrollTop / max : 0;
		if (bar.current !== null) bar.current.style.transform = `scaleY(${Math.min(1, Math.max(0.02, p))})`;
		const next = Math.min(ROOMS.length - 1, Math.round(el.scrollTop / VIEW_H));
		setRoom((prev) => (prev === next ? prev : next));
	}, []);

	const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			<div
				ref={scroller}
				onScroll={onScroll}
				className="h-full w-full snap-y snap-mandatory overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{ROOMS.map((r, i) => (
					<RoomBlock key={r.lines.join(" ")} room={r} index={i} scroller={scroller} />
				))}
			</div>

			{/* chrome: a wordmark, a counter, a rule. all of it is position. */}
			<div className="pointer-events-none absolute inset-0">
				<div
					className="absolute top-0 right-0 left-0 flex items-center justify-between"
					style={{ paddingLeft: PAD_X, paddingRight: PAD_X, paddingTop: 46 }}
				>
					<div className="flex items-center gap-2.5">
						<SpoolMark className="h-[18px] w-[18px] text-thread" title="spool" />
						<span className="font-semibold text-[15px] tracking-tight">spool</span>
					</div>
					<span className="font-mono text-[13px] text-muted">spool.page</span>
				</div>

				<div
					className="absolute right-0 bottom-0 left-0 flex items-end justify-between"
					style={{ paddingLeft: PAD_X, paddingRight: PAD_X, paddingBottom: 22 }}
				>
					<span className="font-mono text-[13px] text-muted tabular-nums">
						<span className="text-text">{pad(room + 1)}</span> / {pad(ROOMS.length)}
					</span>
					<span className="font-mono text-[13px] text-muted">github.com/liamvinberg/spool</span>
				</div>

				<div className="absolute top-[130px] right-[26px] bottom-[92px] w-[2px] bg-border-raised/70">
					<div
						ref={bar}
						className="absolute inset-0 origin-top bg-thread"
						style={{ transform: "scaleY(0.02)", transition: "transform 240ms cubic-bezier(0.22,1,0.36,1)" }}
					/>
				</div>
			</div>
		</div>
	);
}
