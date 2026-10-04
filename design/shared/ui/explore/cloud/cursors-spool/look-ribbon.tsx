import { cn } from "shared/lib/utils";
import { MARK_BANDS } from "shared/ui/explore/cloud/cursors-spool/mark-bands";
import { PeopleList } from "shared/ui/explore/cloud/cursors-spool/people-list";
import { ME, type PersonState, type Pt, type Rect } from "shared/ui/explore/cloud/cursors-spool/scene";
import { type Look, type Moment, blend, mix } from "shared/ui/explore/cloud/cursors-spool/stage";

/**
 * Ribbon, the take that commits. The people in a project are the threads on the
 * spool: the mark at the top right is wound from their colours, one run of
 * bands each, you in the red at the core. Someone going idle drains their bands
 * to grey; following someone leaves only theirs lit.
 *
 * The cursor drops the arrow. It is one band of that ribbon, its sharp end the
 * hotspot: a sliver while the hand moves, opening to carry the name once it
 * rests, so the thing that points and the thing that names are one shape.
 */

const H = 17;
const SLANT = 8;
const NIB = 7;
const CHAR = 6.6;
const IDLE = "#4a4846";
const OFF = "#2b2b2b";

const smooth = (u: number) => {
	const c = Math.min(1, Math.max(0, u));
	return c * c * (3 - 2 * c);
};

/**
 * A band: sharp at the origin, slanted the way the mark's ribbon runs. The top
 * edge falls 2px over its run whatever the length, so the origin is always the
 * highest and sharpest point and reads as the hotspot.
 */
function band(w: number, h = H, s = SLANT) {
	return `M0 0 L${w} 2 L${w + s} ${h} H${s} Z`;
}

function Band({
	w,
	fill,
	children,
	outline = true,
	className,
}: {
	w: number;
	fill: string;
	children?: React.ReactNode;
	outline?: boolean;
	className?: string;
}) {
	return (
		<span className={cn("relative block", className)} style={{ width: w + SLANT, height: H }}>
			<svg className="absolute inset-0 overflow-visible" width={w + SLANT} height={H} aria-hidden="true">
				<path
					d={band(w)}
					fill={fill}
					stroke={outline ? "#0e0e0e" : fill}
					strokeWidth={outline ? 1 : 0}
					strokeLinejoin="round"
				/>
			</svg>
			<span
				className="absolute inset-y-0 flex items-center gap-1.5 overflow-hidden whitespace-nowrap font-mono text-[11px] leading-none text-[#0e0e0e]"
				style={{ left: SLANT / 2 + 5, width: Math.max(0, w - 6) }}
			>
				{children}
			</span>
		</span>
	);
}

function Cursor(s: PersonState, at: Pt) {
	const open = Math.max(1 - s.moving, s.press) * (1 - s.idle);
	const words = s.person.name.toLowerCase();
	const extra = s.hover !== undefined && s.selected === undefined ? s.hover : undefined;
	const full = 12 + (words.length + (extra === undefined ? 0 : extra.length + 2)) * CHAR;
	const w = mix(NIB, full, smooth(open));
	const fill = s.idle > 0 ? blend(s.person.color, IDLE, s.idle) : s.person.color;
	return (
		<div
			className="absolute top-0 left-0"
			style={{
				transform: `translate(${at.x}px, ${at.y}px) scale(${1 - 0.08 * s.press})`,
				transformOrigin: "0 0",
				opacity: mix(1, 0.7, s.idle),
			}}
		>
			<Band w={w} fill={fill}>
				<span style={{ opacity: smooth((open - 0.35) / 0.5) }}>{words}</span>
				{extra === undefined ? null : <span style={{ opacity: smooth((open - 0.35) / 0.5) * 0.55 }}>{extra}</span>}
			</Band>
		</div>
	);
}

function Selection(s: PersonState, rect: Rect) {
	const words = s.person.name.toLowerCase();
	return (
		<div className="pointer-events-none absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
			<span className="absolute inset-0 rounded-lg border-[1.5px]" style={{ borderColor: s.person.color }} />
			<span className="absolute right-[-2px] bottom-full mb-[3px]">
				<Band w={12 + words.length * CHAR} fill={s.person.color} outline={false}>
					{words}
				</Band>
			</span>
		</div>
	);
}

interface Wound {
	person: PersonState["person"];
	color: string;
	opacity: number;
}

/** who owns which band: the mark filled from the bottom up, you first, the way a spool is wound */
function wind(people: readonly Wound[]): (Wound | undefined)[] {
	const n = people.length;
	const out: (Wound | undefined)[] = new Array(MARK_BANDS.length).fill(undefined);
	const base = Math.floor(MARK_BANDS.length / n);
	let extra = MARK_BANDS.length - base * n;
	let at = MARK_BANDS.length - 1;
	for (const p of people) {
		let take = base + (extra > 0 ? 1 : 0);
		if (extra > 0) extra--;
		while (take > 0 && at >= 0) {
			out[at] = p;
			at--;
			take--;
		}
	}
	return out;
}

function woundOf(m: Moment): Wound[] {
	const following = m.scene.following;
	const others = m.states.map((s) => {
		const lit = following === undefined || s.person.id === following;
		const color = !lit ? OFF : s.idle > 0 ? blend(s.person.color, IDLE, s.idle) : s.person.color;
		return { person: s.person, color, opacity: s.here ? 1 : 0.4 };
	});
	return [{ person: ME, color: following === undefined ? ME.color : OFF, opacity: 1 }, ...others];
}

function Roster(m: Moment) {
	const bands = wind(woundOf(m));
	const here = m.states.filter((s) => s.here).length + 1;
	return (
		<div
			className={cn(
				"flex h-8 items-center gap-2 rounded-sm px-1.5",
				m.scene.listOpen === true && "bg-surface",
			)}
		>
			<svg viewBox="250 182 524 660" className="h-[30px] w-[24px]" aria-hidden="true">
				{MARK_BANDS.map((d, i) => (
					<path
						key={d.slice(0, 16)}
						d={d}
						fill={bands[i]?.color ?? OFF}
						fillOpacity={bands[i]?.opacity ?? 1}
						fillRule="evenodd"
						style={{ transition: "fill 300ms cubic-bezier(0.22, 0.61, 0.36, 1)" }}
					/>
				))}
			</svg>
			<span className="text-muted type-detail">
				{m.scene.following === undefined ? `${here} here` : `${m.scene.following}`}
			</span>
		</div>
	);
}

function Swatch(s: PersonState) {
	const quiet = s.idle > 0.5;
	return (
		<svg width="18" height="11" className="overflow-visible" aria-hidden="true">
			<path
				d={band(11, 11, 4)}
				fill={quiet ? IDLE : s.person.color}
				fillOpacity={s.here ? 1 : 0.4}
			/>
		</svg>
	);
}

function Follow(s: PersonState) {
	const words = `following ${s.person.name.toLowerCase()}`;
	return (
		<>
			<span className="absolute inset-0 border-2" style={{ borderColor: s.person.color }} />
			<div className="absolute top-0 left-1/2 flex -translate-x-1/2 items-center gap-2">
				<Band w={12 + words.length * CHAR} fill={s.person.color} outline={false}>
					{words}
				</Band>
				<span className="rounded-[3px] bg-canvas px-1 text-muted type-detail">esc stops</span>
			</div>
		</>
	);
}

export const ribbon: Look = {
	cursor: Cursor,
	selection: Selection,
	roster: Roster,
	list: (m) => <PeopleList states={m.states} mark={Swatch} />,
	follow: Follow,
};
