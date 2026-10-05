import { cn } from "shared/lib/utils";

/**
 * Teammates on a team canvas, as `src/ui/canvas/presence-layer.tsx` and `presence-faces.tsx` draw them, held
 * still: a pointer in the person's colour with their name in a pill, the pill docked on a frame's name while
 * they're inside it live, the grabbing hand and the outline while they drag, the faces at the top right, the
 * who's-here list and the follow mark. Everything here is in screen pixels, which is why the names keep their
 * size at any zoom.
 */

export interface Mate {
	readonly name: string;
	readonly color: string;
	/** the page they're on, when it isn't this one */
	readonly away?: string | undefined;
	readonly idle?: boolean | undefined;
	/** what the who's-here list says beside them, verbatim */
	readonly note?: string | undefined;
}

/** Ink on the near-black every pointer and pill is outlined and written in. */
const INK = "#0e0e0e";

/** One teammate's pointer. Its tip is at `x, y`; the pill rides beside it while it's said. */
export function Cursor({
	mate,
	x,
	y,
	said = true,
	grabbing = false,
}: {
	mate: Mate;
	x: number;
	y: number;
	said?: boolean | undefined;
	grabbing?: boolean | undefined;
}) {
	const ink = mate.idle === true ? 1 / 3 : 1;
	return (
		<>
			<div className="pointer-events-none absolute top-0 left-0" style={{ transform: `translate(${x - 1}px, ${y - 1}px)`, opacity: ink }}>
				{grabbing ? <GrabbingHand color={mate.color} /> : <Arrow color={mate.color} />}
			</div>
			<Pill mate={mate} x={x + 13} y={y + 17} style={{ opacity: said && mate.idle !== true ? 1 : 0 }} />
		</>
	);
}

/** A name docked on a frame's name row: right-aligned to `right`, idle ones dimmed. */
export function DockedPill({ mate, right, y }: { mate: Mate; right: number; y: number }) {
	return (
		<Pill
			mate={mate}
			x={right - pillWidth(mate.name)}
			y={y}
			style={mate.idle === true ? { opacity: 0.45, filter: "saturate(0.2)" } : undefined}
		/>
	);
}

/** A pill's width at 11px medium, near enough to line pills up by. */
export function pillWidth(name: string): number {
	return Math.round(name.length * 6.5 + 14);
}

function Pill({ mate, x, y, style }: { mate: Mate; x: number; y: number; style?: React.CSSProperties | undefined }) {
	return (
		<span
			className="pointer-events-none absolute top-0 left-0 flex h-[18px] items-center whitespace-nowrap rounded-full px-[7px] font-medium text-[11px] leading-none"
			style={{ transform: `translate(${x}px, ${y}px)`, background: mate.color, color: INK, ...style }}
		>
			{mate.name}
		</span>
	);
}

/** The frame a teammate is moving, ringed in their colour at the selection's 3px. */
export function DragOutline({ mate, left, top, width, height }: { mate: Mate; left: number; top: number; width: number; height: number }) {
	return (
		<span
			className="pointer-events-none absolute rounded-[5px] border-[1.5px]"
			style={{ left: left - 3, top: top - 3, width: width + 6, height: height + 6, borderColor: mate.color }}
		/>
	);
}

export function Arrow({ color }: { color: string }) {
	return (
		<svg viewBox="0 0 16 20" width="16" height="20" className="absolute top-0 left-0 overflow-visible" aria-hidden="true">
			<path d="M1.2 1.2v14.6l3.9-3.7 2.7 6.1 2.6-1.1-2.7-6h5.5Z" fill={color} stroke={INK} strokeWidth="1.15" strokeLinejoin="round" />
		</svg>
	);
}

export function GrabbingHand({ color }: { color: string }) {
	return (
		<svg viewBox="0 0 20 20" width="26" height="26" className="absolute top-[-9px] left-[-8px] overflow-visible" aria-hidden="true">
			<path
				d="M5.6 9.2V8c0-.9.7-1.5 1.5-1.5s1.5.6 1.5 1.5v-.6c0-.9.7-1.5 1.5-1.5s1.5.6 1.5 1.5v.3c0-.8.7-1.4 1.5-1.4s1.4.6 1.4 1.4v.6c0-.7.6-1.2 1.3-1.2s1.3.5 1.3 1.3v4.3c0 2.9-2.1 5-4.9 5h-1.6c-1.6 0-3-.7-4-2L3.4 12c-.5-.6-.4-1.4.2-1.9.6-.4 1.4-.3 1.9.2Z"
				fill={color}
				stroke={INK}
				strokeWidth="1.15"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** The faces drawn before the rest collapse into a count. */
const FACES_SHOWN = 4;

/** Who's here, at the window's top right: faces, a `+N` once there are more than fit, and the count. */
export function Faces({ mates, following, open = false }: { mates: readonly Mate[]; following?: string | undefined; open?: boolean | undefined }) {
	const shown = mates.length > FACES_SHOWN ? mates.slice(0, FACES_SHOWN - 1) : mates;
	const more = mates.length - shown.length;
	return (
		<div className="relative flex h-full items-center">
			<span className="mr-3 h-[18px] w-px bg-border-raised" />
			<span className="relative flex h-[30px] items-center">
				{shown.map((mate, i) => (
					<span key={mate.name} className="relative h-[30px] shrink-0" style={{ width: i === shown.length - 1 && more === 0 ? 22 : 17, zIndex: shown.length - i }}>
						<Face mate={mate} followed={following === mate.name} />
					</span>
				))}
				{more > 0 ? (
					<span className="ml-[5px] flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-surface px-1 text-muted tabular-nums type-detail">+{more}</span>
				) : null}
			</span>
			<span className={cn("ml-1 flex h-8 items-center rounded-sm px-1.5 text-muted tabular-nums type-detail", open && "bg-surface")}>{mates.length}</span>
		</div>
	);
}

export function Face({ mate, followed, size = 22 }: { mate: Mate; followed: boolean; size?: number }) {
	const away = mate.away !== undefined;
	return (
		<span
			className="absolute top-1/2 left-0 -translate-y-1/2"
			style={{ width: size, height: size, opacity: mate.idle === true ? 0.45 : 1, filter: mate.idle === true ? "saturate(0.2)" : undefined }}
		>
			<span
				className="absolute inset-0 flex items-center justify-center rounded-full font-semibold text-[10px] uppercase leading-none"
				style={{
					background: away ? "var(--color-bg)" : mate.color,
					color: away ? mate.color : INK,
					boxShadow: `0 0 0 2px var(--color-bg)${away ? `, inset 0 0 0 1.25px ${mate.color}` : ""}`,
				}}
			>
				{mate.name.charAt(0)}
			</span>
			{followed ? <span className="absolute -inset-[4px] rounded-full border-[1.5px]" style={{ borderColor: mate.color }} /> : null}
		</span>
	);
}

/** The list a press on the count opens: each teammate's page or how long they've been idle, then you. */
export function WhoList({ mates, page }: { mates: readonly Mate[]; page: string }) {
	return (
		<div className="flex w-[264px] flex-col rounded-md border border-border-raised bg-raised p-unit">
			{mates.map((mate) => (
				<div key={mate.name} className="flex h-[30px] items-center gap-2.5 rounded-sm px-2.5">
					<span className="relative h-[18px] w-[18px] shrink-0">
						<Face mate={mate} followed={false} size={18} />
					</span>
					<span className={cn("min-w-0 flex-1 truncate type-control", mate.idle === true ? "text-muted" : "text-text")}>{mate.name}</span>
					<span className="text-muted type-detail">{mate.note ?? mate.away ?? page}</span>
				</div>
			))}
			<div className="mx-auto my-1 h-px w-[240px] bg-border-raised" />
			<div className="flex h-[30px] items-center gap-2.5 rounded-sm px-2.5 text-muted">
				<span className="h-[18px] w-[18px] shrink-0 rounded-full border border-border-raised" />
				<span className="min-w-0 flex-1 type-control">You</span>
				<span className="type-detail">{page}</span>
			</div>
		</div>
	);
}

/** The canvas's edge in the followed person's colour, and how to stop. */
export function FollowMark({ mate }: { mate: Mate }) {
	return (
		<div className="pointer-events-none absolute inset-0 z-30">
			<span className="absolute inset-0 border-2" style={{ borderColor: mate.color }} />
			<span className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-xs px-2 pt-[2px] pb-[3px] type-detail" style={{ background: mate.color, color: INK }}>
				following {mate.name} · esc
			</span>
		</div>
	);
}
