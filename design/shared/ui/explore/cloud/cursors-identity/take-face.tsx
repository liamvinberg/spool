import { cn } from "shared/lib/utils";
import { FACES } from "./faces";
import type { Person } from "./script";
import type { Roster, Seen, Take } from "./stage";

/**
 * The face is the cursor. A person's account photo, cut as a drop whose one
 * square corner is the point, stands where they point; the same photo stands in
 * the window's top right. Matching one to the other is recognising a face,
 * which people do before they read. No colour, no names on the canvas.
 */

const RING = "#f0efed";

function Drop({ person, size, idle }: { person: Person; size: number; idle: number }) {
	// the point is the top-left corner, left square so it reads as a tip
	const radius = `0 ${size / 2}px ${size / 2}px ${size / 2}px`;
	return (
		<div className="bg-[#0e0e0e] p-px" style={{ borderRadius: radius }}>
			<div className="p-[1.5px]" style={{ borderRadius: radius, background: RING, opacity: 1 - idle * 0.45 }}>
				<img
					src={FACES[person.id]}
					alt=""
					draggable={false}
					className="block object-cover"
					style={{
						width: size,
						height: size,
						borderRadius: radius,
						filter: `grayscale(${idle})`,
					}}
				/>
			</div>
		</div>
	);
}

function Cursor({ seen }: { seen: Seen; zoomed: boolean }) {
	return (
		<div
			className="origin-top-left"
			style={{
				transform: `scale(${1 - seen.press * 0.14})`,
				opacity: 1 - seen.idle * 0.5,
			}}
		>
			<Drop person={seen.person} size={26} idle={seen.idle} />
		</div>
	);
}

function Face({
	person,
	size,
	idle = 0,
	ring = "var(--color-bg)",
	ringWidth = 2,
}: {
	person: Person;
	size: number;
	idle?: number;
	ring?: string;
	ringWidth?: number;
}) {
	return (
		<span
			className="block shrink-0 rounded-full"
			style={{ padding: ringWidth, background: ring, opacity: 1 - idle * 0.45 }}
		>
			<img
				src={FACES[person.id]}
				alt=""
				draggable={false}
				className="block rounded-full object-cover"
				style={{ width: size, height: size, filter: `grayscale(${idle})` }}
			/>
		</span>
	);
}

function Selection({ seen }: { seen: Seen; w: number; h: number }) {
	return (
		<div style={{ opacity: seen.select }}>
			<div className="absolute -inset-[3px] rounded-[11px] border-[1.5px]" style={{ borderColor: RING }} />
			<div className="absolute top-0 -left-[27px]">
				<Face person={seen.person} size={18} ring={RING} ringWidth={1.5} />
			</div>
		</div>
	);
}

function LabelMark({ seen }: { seen: Seen }) {
	return <Face person={seen.person} size={14} idle={seen.idle} ringWidth={1} />;
}

function Faces({ roster }: { roster: Roster }) {
	const everyone = [
		...roster.here.map((seen) => ({ person: seen.person, idle: seen.idle, where: roster.idleFor[seen.person.id] ?? "here" })),
		...roster.away.map((away) => ({ person: away.person, idle: 0, where: away.page })),
	];
	const shown = everyone.slice(0, 4);
	const more = everyone.length - shown.length;
	return (
		<div className="relative flex h-full items-center gap-3 pl-1">
			<div className="flex items-center">
				{shown.map((entry, i) => {
					const followed = roster.following === entry.person.id;
					const away = entry.where !== "here" && !entry.where.startsWith("idle");
					return (
						<span
							key={entry.person.id}
							className={cn("relative", i > 0 && "-ml-1.5")}
							style={{ zIndex: shown.length - i, opacity: away ? 0.5 : 1 }}
						>
							<Face
								person={entry.person}
								size={24}
								idle={entry.idle}
								ring={followed ? RING : "var(--color-bg)"}
								ringWidth={followed ? 1.5 : 2}
							/>
						</span>
					);
				})}
				{more > 0 ? (
					<span
						className={cn(
							"-ml-1.5 flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-bg px-1 type-detail",
							roster.listOpen ? "bg-raised text-text" : "bg-surface text-muted",
						)}
					>
						+{more}
					</span>
				) : null}
			</div>
			<span className="h-[18px] w-px bg-border-raised" />
			<Face person={roster.you} size={24} ring="var(--color-thread)" ringWidth={1.5} />
		</div>
	);
}

function List({ roster }: { roster: Roster }) {
	const everyone = [
		...roster.here.map((seen) => ({ person: seen.person, idle: seen.idle, where: roster.idleFor[seen.person.id] ?? "here" })),
		...roster.away.map((away) => ({ person: away.person, idle: 0, where: away.page })),
	];
	return (
		<div className="w-[288px] animate-menu-in rounded-md border border-border-raised bg-bg py-1.5">
			{everyone.map((entry) => (
				<div key={entry.person.id} className="flex h-9 items-center gap-2.5 px-3">
					<Face person={entry.person} size={22} idle={entry.idle} ringWidth={0} />
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
			<div className="absolute inset-0 border-2" style={{ borderColor: RING }} />
			<div className="absolute top-3 left-1/2 flex h-8 -translate-x-1/2 items-center gap-2 rounded-full border border-border-raised bg-bg pr-3 pl-1">
				<Face person={seen.person} size={22} ringWidth={0} />
				<span className="text-text type-label">Following {seen.person.first}</span>
				<span className="text-muted type-detail">esc</span>
			</div>
		</>
	);
}

export const faceTake: Take = { Cursor, Selection, LabelMark, Faces, List, FollowEdge };
