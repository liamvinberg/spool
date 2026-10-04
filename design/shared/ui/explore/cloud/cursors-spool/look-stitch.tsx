import { cn } from "shared/lib/utils";
import { PeopleList } from "shared/ui/explore/cloud/cursors-spool/people-list";
import type { PersonState, Pt, Rect } from "shared/ui/explore/cloud/cursors-spool/scene";
import { ARROW, type Look, type Moment, blend, mix } from "shared/ui/explore/cloud/cursors-spool/stage";

/**
 * Stitch, the barely-there take. Spool already draws in lines: a walk is a
 * thread between frames, your selection is a solid red seam. Everyone else is
 * drawn as a running stitch in their own colour, so solid always means yours
 * and stitched always means someone else's.
 *
 * The cursor itself is a plain arrow. Its name is lowercase mono with no plate,
 * said while the hand moves and for a breath after, then let go: a canvas with
 * four people resting on it shows four small arrows and nothing else.
 */

const STITCH = "4 3.5";
const GREY = "#6b6966";

function labelShown(s: PersonState): number {
	// said while moving and 1.6s after, held while pressing, gone when idle
	const after = 1 - Math.min(1, Math.max(0, (s.stillFor - 1.6) / 0.5));
	return Math.max(after, s.press) * (1 - s.idle);
}

function Cursor(s: PersonState, at: Pt) {
	const shown = labelShown(s);
	const color = s.idle > 0 ? blend(s.person.color, GREY, s.idle) : s.person.color;
	const scale = (1 - 0.1 * s.press) * mix(1, 0.86, s.idle);
	return (
		<div className="absolute top-0 left-0" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
			<svg
				width="14"
				height="19"
				viewBox="0 0 14 19"
				className="absolute top-0 left-0 overflow-visible"
				style={{ transform: `scale(${scale})`, transformOrigin: "1px 1px", opacity: mix(1, 0.55, s.idle) }}
				aria-hidden="true"
			>
				<path d={ARROW} fill={color} stroke="#0e0e0e" strokeWidth="1.2" strokeLinejoin="round" />
			</svg>
			<span
				className="absolute top-[15px] left-[12px] flex items-center gap-1.5 whitespace-nowrap rounded-[3px] bg-[#0e0e0e]/90 px-[5px] font-mono text-[11px] leading-4"
				style={{ opacity: shown, transform: `translateX(${mix(-3, 0, shown)}px)`, color: s.person.color }}
			>
				{s.person.name.toLowerCase()}
				{s.hover === undefined || s.selected !== undefined ? null : <span className="text-muted">{s.hover}</span>}
			</span>
		</div>
	);
}

function Selection(s: PersonState, rect: Rect) {
	const pad = 4;
	return (
		<div
			className="pointer-events-none absolute"
			style={{ left: rect.x - pad, top: rect.y - pad, width: rect.w + pad * 2, height: rect.h + pad * 2 }}
		>
			<svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
				<rect
					x="0.75"
					y="0.75"
					width={rect.w + pad * 2 - 1.5}
					height={rect.h + pad * 2 - 1.5}
					rx="11"
					fill="none"
					stroke={s.person.color}
					strokeWidth="1.5"
					strokeDasharray={STITCH}
					strokeLinecap="round"
				/>
			</svg>
			<span
				className="absolute right-1 -top-[24px] font-mono text-[11px] leading-4"
				style={{ color: s.person.color }}
			>
				{s.person.name.toLowerCase()}
			</span>
		</div>
	);
}

function Face({ s, size = 24, pressed = false, dim = false }: { s: PersonState; size?: number; pressed?: boolean; dim?: boolean }) {
	const r = size / 2 - 1;
	const idle = s.idle > 0.5 || !s.here;
	return (
		<span
			className={cn("relative flex shrink-0 items-center justify-center rounded-full bg-surface transition-opacity duration-200", dim && "opacity-40")}
			style={{ width: size, height: size }}
		>
			<svg className="absolute inset-0" width={size} height={size} aria-hidden="true">
				<circle
					cx={size / 2}
					cy={size / 2}
					r={r}
					fill="none"
					stroke={idle ? GREY : s.person.color}
					strokeOpacity={idle ? 0.7 : 1}
					strokeWidth={pressed ? 1.8 : 1.2}
					strokeDasharray={pressed || idle ? undefined : "2.6 2.4"}
				/>
			</svg>
			<span className="font-mono text-[10px] leading-none" style={{ color: idle ? "#94918d" : s.person.color }}>
				{s.person.name[0]}
			</span>
		</span>
	);
}

function Roster(m: Moment) {
	const following = m.scene.following;
	const shown = m.states.slice(0, 4);
	const more = m.states.length - shown.length;
	return (
		<>
			<div className="flex items-center gap-1">
				{shown.map((s) => (
					<Face
						key={s.person.id}
						s={s}
						pressed={s.person.id === following}
						dim={following !== undefined && s.person.id !== following}
					/>
				))}
				{more > 0 ? (
					<span
						className={cn(
							"flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 type-detail",
							m.scene.listOpen === true ? "bg-raised text-text" : "bg-surface text-muted",
						)}
					>
						+{more}
					</span>
				) : null}
			</div>
		</>
	);
}

function Follow(s: PersonState) {
	return (
		<>
			<svg className="absolute inset-[6px] h-[calc(100%-12px)] w-[calc(100%-12px)] overflow-visible" aria-hidden="true">
				<rect
					x="0.75"
					y="0.75"
					style={{ width: "calc(100% - 1.5px)", height: "calc(100% - 1.5px)" }}
					rx="10"
					fill="none"
					stroke={s.person.color}
					strokeWidth="1.5"
					strokeDasharray={STITCH}
					strokeLinecap="round"
				/>
			</svg>
			<div className="absolute top-[-1px] left-1/2 flex -translate-x-1/2 items-center gap-2 bg-canvas px-2.5 py-[1px]">
				<span className="font-mono text-[11px] leading-4" style={{ color: s.person.color }}>
					following {s.person.name.toLowerCase()}
				</span>
				<span className="text-muted type-detail">esc stops</span>
			</div>
		</>
	);
}

export const stitch: Look = {
	cursor: Cursor,
	selection: Selection,
	roster: Roster,
	list: (m) => <PeopleList states={m.states} mark={(s) => <Face s={s} size={20} />} />,
	follow: Follow,
};
