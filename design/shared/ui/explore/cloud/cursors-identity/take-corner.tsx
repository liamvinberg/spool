import { cn } from "shared/lib/utils";
import type { Person } from "./script";
import { ramp } from "./script";
import type { Roster, Seen, Take } from "./stage";

/**
 * A person is a corner and two letters. The cursor is one corner of a crop mark
 * with their initials set inside it; what they select gets all four corners;
 * following them puts the four corners on your window. There is no colour at
 * all: red stays the one thing that means you, and the ink inverts against
 * whatever is under it, so it reads the same on a white frame and the canvas.
 */

const INK = "#ffffff";
const SET = "font-sans text-[11px] leading-[13px] font-semibold tracking-[0.02em]";

function Cursor({ seen }: { seen: Seen; zoomed: boolean }) {
	// arms close in while pressed and further while idle, so the shape says it before the ink does
	const arm = 13 - seen.press * 4 - seen.idle * 6;
	const named = ramp(seen.still, 0.9, 0.28) * (1 - seen.idle);
	return (
		<div style={{ opacity: 1 - seen.idle * 0.55, color: INK }}>
			<svg width="16" height="16" viewBox="0 0 16 16" className="absolute top-0 left-0 overflow-visible" aria-hidden="true">
				<path
					d={`M0.9 ${arm} V0.9 H${arm}`}
					fill="none"
					stroke="currentColor"
					strokeWidth={1.6 + seen.press * 0.6}
					strokeLinecap="square"
				/>
			</svg>
			<div className={cn("absolute top-[5px] left-[6px] whitespace-nowrap", SET)}>
				<span style={{ opacity: 1 - named }}>{seen.person.initials}</span>
				<span
					className="absolute top-0 left-0"
					style={{ opacity: named, clipPath: `inset(0 ${(1 - named) * 100}% 0 0)` }}
				>
					{seen.person.first}
				</span>
			</div>
		</div>
	);
}

function Corners({ inset, arm, width, color = INK }: { inset: number; arm: number; width: number; color?: string }) {
	const half = width / 2;
	const paths = [
		`M${half} ${arm} V${half} H${arm}`,
		`M${-arm} ${half} H${-half} V${arm}`,
		`M${half} ${-arm} V${-half} H${arm}`,
		`M${-arm} ${-half} H${-half} V${-arm}`,
	];
	const spots = ["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"];
	return (
		<div className="absolute" style={{ inset: -inset }}>
			{paths.map((d, i) => (
				<svg key={spots[i]} width="1" height="1" className={cn("absolute overflow-visible", spots[i])} aria-hidden="true">
					<path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="square" />
				</svg>
			))}
		</div>
	);
}

function Selection({ seen }: { seen: Seen; w: number; h: number }) {
	// the corners arrive from a little further out, the way a crop mark is laid down
	return (
		<div style={{ opacity: seen.select }}>
			<Corners inset={4 + (1 - seen.select) * 6} arm={16} width={1.6} />
		</div>
	);
}

function LabelMark({ seen }: { seen: Seen }) {
	const holding = seen.selecting !== null;
	return (
		<span
			className={cn(
				"flex h-[15px] items-center rounded-[2px] px-[3px] text-[10px] leading-none font-semibold tracking-[0.02em]",
				holding ? "bg-[#f0efed] text-[#0e0e0e]" : "text-text",
			)}
			style={{ opacity: 1 - seen.idle * 0.6 }}
		>
			{seen.person.initials}
		</span>
	);
}

function Glyph({ person, tone = "text-text", size = "md" }: { person: Person; tone?: string; size?: "md" | "sm" }) {
	const arm = size === "md" ? 8 : 7;
	return (
		<span className={cn("relative inline-flex shrink-0", tone, size === "md" ? "h-[22px] w-[26px]" : "h-[18px] w-[24px]")}>
			<svg width="10" height="10" className="absolute top-0 left-0 overflow-visible" aria-hidden="true">
				<path d={`M0.75 ${arm} V0.75 H${arm}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
			</svg>
			<span className={cn("absolute top-[4px] left-[5px]", SET, size === "sm" && "text-[10px]")}>{person.initials}</span>
		</span>
	);
}

function Faces({ roster }: { roster: Roster }) {
	const everyone = [
		...roster.here.map((seen) => ({ person: seen.person, idle: seen.idle > 0.5, where: roster.idleFor[seen.person.id] ?? "here" })),
		...roster.away.map((away) => ({ person: away.person, idle: false, where: away.page })),
	];
	const shown = everyone.slice(0, 5);
	const more = everyone.length - shown.length;
	return (
		<div className="relative flex h-full items-center gap-3 pl-1">
			<div className="flex items-center gap-2.5">
				{shown.map((entry) => {
					const followed = roster.following === entry.person.id;
					const dim = entry.idle || entry.where !== "here";
					return (
						<span key={entry.person.id} className="relative flex">
							<Glyph person={entry.person} tone={dim ? "text-muted" : "text-text"} />
							{followed ? <Corners inset={3} arm={5} width={1.5} color="#f0efed" /> : null}
						</span>
					);
				})}
				{more > 0 ? (
					<span className={cn("pl-1 type-detail", roster.listOpen ? "text-text" : "text-muted")}>+{more}</span>
				) : null}
			</div>
			<span className="h-[18px] w-px bg-border-raised" />
			<Glyph person={roster.you} tone="text-thread" />
		</div>
	);
}

function List({ roster }: { roster: Roster }) {
	const everyone = [
		...roster.here.map((seen) => ({ person: seen.person, idle: seen.idle > 0.5, where: roster.idleFor[seen.person.id] ?? "here" })),
		...roster.away.map((away) => ({ person: away.person, idle: false, where: away.page })),
	];
	return (
		<div className="w-[280px] animate-menu-in rounded-md border border-border-raised bg-bg py-1.5">
			{everyone.map((entry) => (
				<div key={entry.person.id} className="flex h-9 items-center gap-2.5 px-3">
					<Glyph person={entry.person} size="sm" tone={entry.where === "here" ? "text-text" : "text-muted"} />
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
			<Corners inset={-10} arm={28} width={2} color="#f0efed" />
			<div className="absolute top-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-2 rounded-md border border-border-raised bg-bg pr-3 pl-2.5">
				<Glyph person={seen.person} size="sm" />
				<span className="text-text type-label">Following {seen.person.first}</span>
				<span className="text-muted type-detail">esc</span>
			</div>
		</>
	);
}

export const cornerTake: Take = { Cursor, Selection, LabelMark, Faces, List, FollowEdge, blend: "difference" };
