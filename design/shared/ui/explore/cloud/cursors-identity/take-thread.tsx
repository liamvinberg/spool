import { cn } from "shared/lib/utils";
import { type Person, ramp } from "./script";
import type { Roster, Seen, Take } from "./stage";

/**
 * A person is a colour and a dot, and the dot pays out thread behind it as it
 * moves: the last half second of their hand, tapering to nothing. At rest the
 * thread is wound back in and their first name unspools beside the dot. The
 * colours share one lightness and keep clear of red, so the thread stays the
 * one red thing on screen and means you.
 */

const light = (p: Person) => `oklch(0.8 0.1 ${p.hue})`;
const dark = (p: Person) => `oklch(0.5 0.12 ${p.hue})`;
const mid = (p: Person) => `oklch(0.7 0.12 ${p.hue})`;

function Cursor({ seen }: { seen: Seen; zoomed: boolean }) {
	const awake = 1 - seen.idle;
	const named = ramp(seen.still, 1.0, 0.32) * awake;
	const hollow = seen.over === null ? 1 - ramp(seen.overFor, 0, 0.18) : ramp(seen.overFor, 0, 0.18);
	const size = 10 - seen.press * 3;
	const ink = seen.over === null ? light(seen.person) : dark(seen.person);
	const segments = seen.trail.slice(1).map((point, i) => {
		const from = seen.trail[i]!;
		const u = i / (seen.trail.length - 1);
		return { x1: from.x - seen.x, y1: from.y - seen.y, x2: point.x - seen.x, y2: point.y - seen.y, w: 2.6 * (1 - u) + 0.4, o: (1 - u) * 0.9 };
	});
	return (
		<div style={{ opacity: 1 - seen.idle * 0.5 }}>
			<svg width="1" height="1" className="absolute top-0 left-0 overflow-visible" aria-hidden="true">
				{segments.map((s) => (
					<line
						key={`${s.w}`}
						x1={s.x1}
						y1={s.y1}
						x2={s.x2}
						y2={s.y2}
						stroke={mid(seen.person)}
						strokeWidth={s.w}
						strokeOpacity={s.o * awake}
						strokeLinecap="round"
					/>
				))}
			</svg>
			{/* the dot: colour inside a hairline of the canvas, so it holds on a white frame too.
			    Over a frame it opens to a ring, which is what looking at something reads as */}
			<span
				className="absolute rounded-full"
				style={{
					width: size + 3,
					height: size + 3,
					left: -(size + 3) / 2,
					top: -(size + 3) / 2,
					background: "#0e0e0e",
				}}
			/>
			<span
				className="absolute rounded-full"
				style={{
					width: size,
					height: size,
					left: -size / 2,
					top: -size / 2,
					background: seen.idle > 0.5 ? "var(--color-muted)" : light(seen.person),
				}}
			/>
			<span
				className="absolute rounded-full bg-[#0e0e0e]"
				style={{
					width: (size - 4) * Math.max(hollow, seen.idle),
					height: (size - 4) * Math.max(hollow, seen.idle),
					left: (-(size - 4) * Math.max(hollow, seen.idle)) / 2,
					top: (-(size - 4) * Math.max(hollow, seen.idle)) / 2,
				}}
			/>
			<span
				className="absolute top-[-9px] left-[11px] whitespace-nowrap font-sans text-[12px] leading-[18px] font-medium"
				style={{ color: ink, opacity: named, clipPath: `inset(0 ${(1 - named) * 100}% 0 0)` }}
			>
				{seen.person.first}
			</span>
		</div>
	);
}

function Selection({ seen }: { seen: Seen; w: number; h: number }) {
	return (
		<div
			className="absolute -inset-[3px] rounded-[11px] border-[1.5px]"
			style={{ borderColor: light(seen.person), opacity: seen.select }}
		/>
	);
}

function LabelMark({ seen }: { seen: Seen }) {
	const holding = seen.selecting !== null;
	return (
		<span
			className="h-[7px] w-[7px] rounded-full border-[1.5px]"
			style={{
				borderColor: light(seen.person),
				background: holding ? light(seen.person) : "transparent",
				opacity: 1 - seen.idle * 0.6,
			}}
		/>
	);
}

function Disc({
	person,
	size = 26,
	state = "here",
}: {
	person: Person;
	size?: number;
	state?: "here" | "idle" | "away" | "you" | "followed";
}) {
	const tone =
		state === "you" ? "var(--color-thread)" : state === "idle" || state === "away" ? "var(--color-muted)" : light(person);
	const filled = state === "followed";
	return (
		<span
			className="flex shrink-0 items-center justify-center rounded-full border-[1.5px] font-sans text-[10px] font-semibold tracking-[0.02em]"
			style={{
				width: size,
				height: size,
				borderColor: tone,
				borderStyle: state === "away" ? "dashed" : "solid",
				background: filled ? tone : "var(--color-bg)",
				color: filled ? "#0e0e0e" : tone,
				opacity: state === "away" ? 0.7 : 1,
			}}
		>
			{person.initials}
		</span>
	);
}

function Faces({ roster }: { roster: Roster }) {
	const everyone = [
		...roster.here.map((seen) => ({
			person: seen.person,
			state: (seen.idle > 0.5 ? "idle" : roster.following === seen.person.id ? "followed" : "here") as "idle" | "followed" | "here",
			where: roster.idleFor[seen.person.id] ?? "here",
		})),
		...roster.away.map((away) => ({ person: away.person, state: "away" as const, where: away.page })),
	];
	const shown = everyone.slice(0, 5);
	const more = everyone.length - shown.length;
	return (
		<div className="relative flex h-full items-center gap-3 pl-1">
			<div className="flex items-center gap-1">
				{shown.map((entry) => (
					<Disc key={entry.person.id} person={entry.person} state={entry.state} />
				))}
				{more > 0 ? (
					<span className={cn("pl-1 type-detail", roster.listOpen ? "text-text" : "text-muted")}>+{more}</span>
				) : null}
			</div>
			<span className="h-[18px] w-px bg-border-raised" />
			<Disc person={roster.you} state="you" />
		</div>
	);
}

function List({ roster }: { roster: Roster }) {
	const everyone = [
		...roster.here.map((seen) => ({
			person: seen.person,
			state: (seen.idle > 0.5 ? "idle" : roster.following === seen.person.id ? "followed" : "here") as "idle" | "followed" | "here",
			where: roster.idleFor[seen.person.id] ?? "here",
		})),
		...roster.away.map((away) => ({ person: away.person, state: "away" as const, where: away.page })),
	];
	return (
		<div className="w-[280px] animate-menu-in rounded-md border border-border-raised bg-bg py-1.5">
			{everyone.map((entry) => (
				<div key={entry.person.id} className="flex h-9 items-center gap-2.5 px-3">
					<span
						className="ml-1 h-2 w-2 shrink-0 rounded-full"
						style={{ background: entry.state === "here" ? light(entry.person) : "transparent", border: `1.5px solid ${entry.state === "here" ? light(entry.person) : "var(--color-muted)"}` }}
					/>
					<span className={cn("min-w-0 flex-1 truncate type-label", entry.where === "here" ? "text-text" : "text-muted")}>
						{entry.person.name}
					</span>
					<span className="text-muted type-detail">{entry.where}</span>
				</div>
			))}
			<div className="mx-3 mt-1.5 border-border border-t pt-2 pb-1 text-muted type-caption">
				Press someone to see what they see.
			</div>
		</div>
	);
}

function FollowEdge({ seen }: { seen: Seen }) {
	return (
		<>
			<div className="absolute inset-0 border-2" style={{ borderColor: light(seen.person) }} />
			<div className="absolute top-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-2 rounded-full border border-border-raised bg-bg pr-3 pl-3">
				<span className="h-2 w-2 rounded-full" style={{ background: light(seen.person) }} />
				<span className="text-text type-label">Following {seen.person.first}</span>
				<span className="text-muted type-detail">esc</span>
			</div>
		</>
	);
}

export const threadTake: Take = { Cursor, Selection, LabelMark, Faces, List, FollowEdge };
