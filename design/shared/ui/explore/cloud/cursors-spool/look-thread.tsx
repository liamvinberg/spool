import { cn } from "shared/lib/utils";
import { PeopleList } from "shared/ui/explore/cloud/cursors-spool/people-list";
import { type PersonState, type Pt, type Rect } from "shared/ui/explore/cloud/cursors-spool/scene";
import { ARROW, type Look, type Moment, blend, mix } from "shared/ui/explore/cloud/cursors-spool/stage";

/**
 * Thread, the take in between. The arrow is a needle: while a hand moves it pulls
 * half a second of fine thread behind it, so you read where someone is going
 * without reading a name. When it stops, the thread is taken up and laid down
 * again as the line under their name. Moving says direction, resting says who.
 *
 * A selection is that thread wound once round the frame, drawn on from the
 * corner over half a second. Idle is the thread left hanging.
 */

const GREY = "#6b6966";
const TRAIL = 18;
const TRAIL_S = 0.5;

const smooth = (u: number) => {
	const c = Math.min(1, Math.max(0, u));
	return c * c * (3 - 2 * c);
};

function Trail(s: PersonState, m: Moment) {
	if (s.idle > 0.9) return null;
	const pts: Pt[] = [];
	for (let i = 0; i <= TRAIL; i++) pts.push(m.trace(s, (i / TRAIL) * TRAIL_S));
	const head = pts[0];
	if (head === undefined) return null;
	return (
		<svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
			{pts.slice(1).map((p, i) => {
				const prev = pts[i] ?? head;
				const u = i / TRAIL;
				return (
					<line
						key={u}
						x1={prev.x + 1}
						y1={prev.y + 1}
						x2={p.x + 1}
						y2={p.y + 1}
						stroke={s.person.color}
						strokeWidth={mix(1.7, 0.5, u)}
						strokeOpacity={(1 - u) ** 1.3 * 0.85 * (1 - s.idle)}
						strokeLinecap="round"
					/>
				);
			})}
		</svg>
	);
}

function Cursor(s: PersonState, at: Pt) {
	const laid = Math.max(1 - s.moving, s.press) * (1 - s.idle);
	const color = s.idle > 0 ? blend(s.person.color, GREY, s.idle) : s.person.color;
	return (
		<div className="absolute top-0 left-0" style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
			{/* idle: the thread left hanging off the tip, drawn down as the colour drains */}
			<svg className="absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden="true">
				<path
					d="M1.2 1.5 C -4 10, 9 15, 2.5 27"
					fill="none"
					stroke={GREY}
					strokeWidth="1.2"
					strokeLinecap="round"
					pathLength={1}
					strokeDasharray="1 1"
					strokeDashoffset={1 - s.idle}
					opacity={s.idle > 0 ? 0.9 : 0}
				/>
			</svg>
			<svg
				width="14"
				height="19"
				viewBox="0 0 14 19"
				className="absolute top-0 left-0 overflow-visible"
				style={{ transform: `scale(${1 - 0.1 * s.press})`, transformOrigin: "1px 1px", opacity: mix(1, 0.6, s.idle) }}
				aria-hidden="true"
			>
				<path d={ARROW} fill={color} stroke="#0e0e0e" strokeWidth="1.2" strokeLinejoin="round" />
			</svg>
			<span
				className="absolute top-[16px] left-[11px] flex flex-col whitespace-nowrap rounded-[3px] bg-[#0e0e0e]/90 px-[5px] pt-px pb-[3px]"
				style={{ opacity: laid > 0.02 ? 1 : 0, clipPath: `inset(0 ${(1 - laid) * 100}% 0 0 round 3px)` }}
			>
				<span className="flex items-center gap-1.5 font-mono text-[11px] leading-4" style={{ color: s.person.color }}>
					{s.person.name.toLowerCase()}
					{s.hover === undefined || s.selected !== undefined ? null : <span className="text-muted">{s.hover}</span>}
				</span>
				<span
					className="h-[1.5px] rounded-full"
					style={{ background: s.person.color, width: `${laid * 100}%` }}
				/>
			</span>
		</div>
	);
}

function Selection(s: PersonState, rect: Rect, m: Moment) {
	const span = s.track.select?.find((sel) => m.t >= sel.from && m.t < sel.to);
	const on = span === undefined ? 1 : Math.min(smooth((m.t - span.from) / 0.5), 1 - smooth((m.t - (span.to - 0.35)) / 0.35));
	return (
		<div className="pointer-events-none absolute" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
			<svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
				<path
					d={roundRect(rect.w, rect.h, 8)}
					fill="none"
					stroke={s.person.color}
					strokeWidth="1.5"
					strokeLinecap="round"
					pathLength={1}
					strokeDasharray="1 1"
					strokeDashoffset={1 - on}
				/>
			</svg>
			<span className="absolute right-0 -top-[26px] flex flex-col items-end" style={{ opacity: on }}>
				<span className="font-mono text-[11px] leading-4" style={{ color: s.person.color }}>
					{s.person.name.toLowerCase()}
				</span>
				<span className="h-[1.5px] w-full rounded-full" style={{ background: s.person.color }} />
			</span>
		</div>
	);
}

/** a rounded rectangle as one path, starting at the top-left corner and running clockwise */
function roundRect(w: number, h: number, r: number) {
	return `M0 ${r} A${r} ${r} 0 0 1 ${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} Z`;
}

/** how much a person has moved in the last couple of seconds, as a thread's length */
function activity(s: PersonState) {
	if (!s.here) return 0;
	return (1 - smooth(s.stillFor / 2.5)) * (1 - s.idle);
}

function Face({ s, size = 24, pressed = false, dim = false }: { s: PersonState; size?: number; pressed?: boolean; dim?: boolean }) {
	const quiet = s.idle > 0.5 || !s.here;
	return (
		<span className={cn("flex shrink-0 flex-col items-center gap-[3px] transition-opacity duration-200", dim && "opacity-40")}>
			<span
				className="flex items-center justify-center rounded-full bg-surface font-mono text-[10px] leading-none"
				style={{
					width: size,
					height: size,
					color: quiet ? "#94918d" : s.person.color,
					boxShadow: pressed ? `inset 0 0 0 1.5px ${s.person.color}` : undefined,
				}}
			>
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
		<div className="flex items-center gap-1.5">
			{shown.map((s) => (
				<span key={s.person.id} className="relative flex flex-col items-center">
					<Face s={s} pressed={s.person.id === following} dim={following !== undefined && s.person.id !== following} />
					<span
						className="absolute -bottom-[6px] h-[2px] rounded-full"
						style={{ background: s.person.color, width: mix(0, 16, activity(s)), opacity: activity(s) > 0.01 ? 1 : 0 }}
					/>
				</span>
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
	);
}

/** the last six seconds of a person's movement, drawn as the thread they pulled */
function Spark(s: PersonState, m: Moment) {
	if (!s.here) return null;
	const w = 44;
	const n = 30;
	const ys: number[] = [];
	if (s.here && s.idle < 0.5) {
		for (let i = 0; i < n; i++) {
			const a = m.trace(s, ((n - i) / n) * 6);
			const b = m.trace(s, ((n - i - 1) / n) * 6);
			ys.push(Math.min(1, Math.hypot(b.x - a.x, b.y - a.y) / 60));
		}
	}
	const d =
		ys.length === 0
			? `M0 10 H${w}`
			: ys.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (n - 1)) * w).toFixed(1)} ${(10 - v * 8).toFixed(1)}`).join(" ");
	return (
		<svg width={w} height="12" className="mr-1 shrink-0" aria-hidden="true">
			<path
				d={d}
				fill="none"
				stroke={ys.length === 0 ? "#363636" : s.person.color}
				strokeWidth="1.2"
				strokeLinejoin="round"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function Follow(s: PersonState) {
	return (
		<>
			<span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: s.person.color }} />
			<div className="absolute top-3 right-4 flex items-center gap-2 rounded-[3px] bg-[#0e0e0e]/90 px-2 py-0.5">
				<span className="font-mono text-[11px] leading-4" style={{ color: s.person.color }}>
					following {s.person.name.toLowerCase()}
				</span>
				<span className="text-muted type-detail">esc stops</span>
			</div>
		</>
	);
}

export const thread: Look = {
	under: Trail,
	cursor: Cursor,
	selection: Selection,
	roster: Roster,
	list: (m) => <PeopleList states={m.states} mark={(s) => <Face s={s} size={20} />} trailing={(s) => Spark(s, m)} />,
	follow: Follow,
};
