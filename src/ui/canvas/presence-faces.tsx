import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useContext, useEffect, useReducer, useRef, useState } from "react";
import { PRESENCE_SHOWN } from "../../team-sync-protocol";
import { cn } from "../cn";
import { Menu, MenuItem, MenuSeparator } from "../primitives/overlays";
import { Measuring } from "./corner-row";
import {
	agentSays,
	awayFor,
	here,
	type Look,
	look,
	nextChange,
	type PresenceRoom,
	placeOf,
	type Teammate,
} from "./presence";

/**
 * Who's here, as a row of faces at the canvas's top right (task 503, spool#312), between the agent's path and Present
 * (`corner-row.tsx`): the people on this page first, filled in their colour, then the ones on the project's other
 * pages as rings, the unfocused at half ink. The away aren't here, so they aren't drawn. Four faces at most, three and
 * a `+N` past that (`max`). Pressed, it lets a list down from the faces: everyone here with where they are, then the
 * away and how long, then you. A row follows that person; pressing it again, or esc once the list is closed, stops.
 */

/** The near-black every name in a person's colour is written in, whatever the theme: on their colour it always reads. */
export const PRESENCE_INK = "#0e0e0e";

/** The faces drawn before the rest collapse into `+N`. */
const FACES_SHOWN = 4;
/** `--ease-snap`, as motion takes a curve */
const SNAP = [0.32, 0.72, 0, 1] as const;
/** A face in the row, and how far each one tucks under the one before it. */
const SIZE = 18;
const TUCK = 4;

/**
 * Draw again whenever anyone in the room changes, and whenever the clock alone changes what is said of them: a
 * name going quiet, someone's look changing, and each minute while someone is away, which the list counts.
 */
export function useRoomDrawn(room: PresenceRoom): void {
	const [, redraw] = useReducer((n: number) => n + 1, 0);
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const schedule = () => {
			if (timer !== undefined) clearTimeout(timer);
			const now = Date.now();
			const mates = room.teammates();
			const next = nextChange(mates, now);
			const counting = mates.some((mate) => mate.left === null && look(mate, now) === "away");
			const minute = counting ? now + 60_000 - (now % 60_000) : undefined;
			const at = next === undefined ? minute : minute === undefined ? next : Math.min(next, minute);
			timer = at === undefined ? undefined : setTimeout(schedule, at - now + 5);
			redraw();
		};
		schedule();
		const unhear = room.subscribe(schedule);
		return () => {
			unhear();
			if (timer !== undefined) clearTimeout(timer);
		};
	}, [room]);
}

/** Who to draw a face for, at `now`: the people on this page first, then the ones on the project's other pages. */
export function facesOf(room: PresenceRoom, page: string, now: number) {
	// in the order they arrived, so a face that dims stays where it was instead of trading places
	const mates = room
		.teammates()
		.filter((mate) => mate.left === null)
		.map((mate) => ({ mate, look: look(mate, now) }));
	const onPage = mates.filter((one) => here(one.look) && one.mate.state.page === page);
	const elsewhere = mates.filter((one) => here(one.look) && one.mate.state.page !== page);
	const away = mates.filter((one) => one.look === "away");
	return { onPage, elsewhere, away, faces: [...onPage, ...elsewhere] };
}

export function PresenceFaces({
	room,
	page,
	project,
	following,
	onFollow,
	max = FACES_SHOWN,
	align = "start",
}: {
	room: PresenceRoom;
	/** The page this canvas is on: someone elsewhere is drawn as a ring. */
	page: string;
	/** What the project's root page is called where a place names it. */
	project: string;
	following: string | null;
	onFollow: (accountId: string | null) => void;
	/** The faces drawn before the rest become `+N`: lowered by the top right's row when it is short (`corner-row.tsx`). */
	max?: number;
	/** Which edge the list lets down from: the faces' end where they stand at the right. */
	align?: "start" | "end";
}) {
	useRoomDrawn(room);
	const measuring = useContext(Measuring);
	const still = useReducedMotion() === true;
	const [opened, setOpen] = useState(false);
	const open = opened && !measuring;
	const root = useRef<HTMLDivElement | null>(null);
	const button = useRef<HTMLButtonElement | null>(null);
	const now = Date.now();
	const { onPage, elsewhere, away, faces } = facesOf(room, page, now);
	const empty = faces.length === 0;
	useEffect(() => {
		if (empty) setOpen(false);
	}, [empty]);
	useEffect(() => {
		if (!open) return;
		const close = (event: PointerEvent) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false);
		};
		const closeOnEsc = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			// the list goes first; following stops on the esc after
			event.stopImmediatePropagation();
			setOpen(false);
			if (root.current?.contains(document.activeElement)) button.current?.focus();
		};
		window.addEventListener("pointerdown", close, true);
		window.addEventListener("keydown", closeOnEsc, true);
		return () => {
			window.removeEventListener("pointerdown", close, true);
			window.removeEventListener("keydown", closeOnEsc, true);
		};
	}, [open]);

	// the canvas under it never takes a press, a wheel or a menu meant for the faces or the list
	useEffect(() => {
		const element = root.current;
		if (element === null || measuring) return;
		const keep = (event: Event) => event.stopPropagation();
		const kinds = ["pointerdown", "wheel", "contextmenu"] as const;
		for (const kind of kinds) element.addEventListener(kind, keep);
		return () => {
			for (const kind of kinds) element.removeEventListener(kind, keep);
		};
	}, [measuring]);

	if (empty) return null;
	const shown = faces.length > max ? faces.slice(0, max - 1) : faces;
	const more = faces.length - shown.length;
	// a face coming or going slides the others along on one spring, no bounce
	const slide = still ? { duration: 0 } : ({ type: "spring", duration: 0.4, bounce: 0 } as const);
	const fade = still ? { duration: 0 } : { duration: 0.18, ease: SNAP };
	const hook = (value: string) => (measuring ? undefined : value);
	const follow = (mate: Teammate) => {
		setOpen(false);
		onFollow(following === mate.person.accountId ? null : mate.person.accountId);
	};
	const row = ({ mate, look }: { mate: Teammate; look: Look }) => (
		<Row
			key={mate.person.accountId}
			mate={mate}
			look={look}
			page={page}
			project={project}
			now={now}
			followed={following === mate.person.accountId}
			onFollow={follow}
		/>
	);

	return (
		<div ref={root} className="relative flex items-center" data-presence-faces={hook("")}>
			<button
				ref={button}
				type="button"
				tabIndex={measuring ? -1 : undefined}
				aria-label="Who is here"
				aria-expanded={open}
				aria-haspopup="menu"
				data-presence-open={hook("")}
				className={cn(
					"group/faces flex h-control-sm items-center rounded-full pr-1.5 pl-1 transition-colors duration-fast ease-out hover:bg-state-hover focus-ring",
					open && "bg-state-hover",
				)}
				onClick={(event) => {
					const opening = !open;
					setOpen(opening);
					// opened from the keyboard, the keyboard goes on into the list
					if (opening && event.detail === 0)
						requestAnimationFrame(() =>
							root.current?.querySelector<HTMLButtonElement>("[data-presence-row]")?.focus(),
						);
				}}
			>
				{/* the row grows from the faces' end where they stand at the right */}
				<AnimatePresence initial={false} mode="popLayout" anchorX={align === "end" ? "right" : "left"}>
					{shown.map(({ mate, look }, i) => (
						<motion.span
							key={mate.person.accountId}
							layout={measuring ? false : "position"}
							initial={{ opacity: 0, scale: 0.6 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.6 }}
							transition={{ layout: slide, default: fade }}
							data-presence-face={hook(mate.person.accountId)}
							title={`${mate.person.name} · ${agentSays(mate) ?? placeOf(mate, page, project).full}`}
							className="relative transition-[margin] duration-fast ease-out group-hover/faces:ml-0.5"
							style={{ marginLeft: i === 0 ? 0 : -TUCK, zIndex: shown.length - i }}
						>
							<Face
								mate={mate}
								look={look}
								elsewhere={mate.state.page !== page}
								followed={following === mate.person.accountId}
							/>
						</motion.span>
					))}
					{more > 0 ? (
						<motion.span
							key="more"
							layout={measuring ? false : "position"}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ layout: slide, default: fade }}
							data-presence-more={hook("")}
							className="ml-1.5 text-secondary tabular-nums type-detail"
						>
							+{more}
						</motion.span>
					) : null}
				</AnimatePresence>
			</button>
			{open && (
				<Menu
					aria-label="Who is here"
					data-presence-list=""
					className={cn("absolute top-full z-30 mt-1.5 w-[296px]", align === "end" ? "right-0" : "left-0")}
				>
					{onPage.map(row)}
					{onPage.length > 0 && elsewhere.length > 0 && <MenuSeparator />}
					{elsewhere.map(row)}
					{away.length > 0 && <MenuSeparator />}
					{away.map(row)}
					<MenuSeparator />
					<div className="flex h-row items-center gap-2 px-2 text-secondary">
						<span className="size-4 shrink-0 rounded-full border border-line-strong" />
						<span className="min-w-0 flex-1 truncate type-control">You</span>
						<span
							className="max-w-[150px] shrink-0 truncate type-detail"
							title={placeOf(null, page, project).full}
						>
							{placeOf(null, page, project).said}
						</span>
					</div>
				</Menu>
			)}
			{room.pointerHidden() && !open && !measuring && (
				<div
					data-presence-hidden=""
					role="status"
					className={cn(
						"absolute top-full mt-1.5 whitespace-nowrap rounded-md border border-line-strong bg-surface-window px-2 py-1 text-secondary type-detail",
						align === "end" ? "right-0" : "left-0",
					)}
				>
					Your pointer is hidden: {PRESENCE_SHOWN} others are shown on this page
				</div>
			)}
		</div>
	);
}

/** One person in the list: face, whole name, where they are. Pointed at, the place makes way for what a press does. */
function Row({
	mate,
	look,
	page,
	project,
	now,
	followed,
	onFollow,
}: {
	mate: Teammate;
	look: Look;
	page: string;
	project: string;
	now: number;
	followed: boolean;
	onFollow: (mate: Teammate) => void;
}) {
	const place = placeOf(mate, page, project);
	const says = look === "away" ? awayFor(mate, now) : (agentSays(mate) ?? place.said);
	return (
		<MenuItem
			data-presence-row={mate.person.accountId}
			title={`${mate.person.name} · ${look === "away" ? says : (agentSays(mate) ?? place.full)}`}
			icon={
				<Face
					mate={mate}
					look={look}
					elsewhere={mate.state.page !== page}
					size={16}
					edge="var(--color-surface-window)"
				/>
			}
			label={<span className={cn(look !== "active" && "text-secondary")}>{mate.person.name}</span>}
			meta={
				followed ? (
					<span data-presence-row-says="" style={{ color: mate.person.color }}>
						following
					</span>
				) : (
					<span className="grid justify-items-end">
						<span
							data-presence-row-says=""
							className="col-start-1 row-start-1 max-w-[150px] truncate transition-opacity duration-fast ease-out group-hover/item:opacity-0 group-focus-visible/item:opacity-0"
						>
							{says}
						</span>
						<span
							aria-hidden="true"
							className="col-start-1 row-start-1 text-primary opacity-0 transition-opacity duration-fast ease-out group-hover/item:opacity-100 group-focus-visible/item:opacity-100"
						>
							follow
						</span>
					</span>
				)
			}
			onClick={() => onFollow(mate)}
		/>
	);
}

/**
 * One person's face: the first letter on their colour where this canvas is, a ring of their colour elsewhere, half
 * ink while unfocused, without colour while away, and a ring round it while followed.
 */
export function Face({
	mate,
	look,
	elsewhere,
	followed = false,
	size = SIZE,
	edge = "var(--color-surface-canvas)",
}: {
	mate: Teammate;
	look: Look;
	elsewhere: boolean;
	followed?: boolean;
	size?: number;
	/** what it is cut out of where faces overlap */
	edge?: string;
}) {
	const { color, name } = mate.person;
	const away = look === "away" || look === "gone";
	return (
		<span
			className="relative flex shrink-0 items-center justify-center rounded-full font-semibold uppercase leading-none transition-[background-color,color,box-shadow,opacity] duration-base ease-out"
			style={{
				width: size,
				height: size,
				fontSize: size <= 16 ? 9 : 10,
				opacity: look === "unfocused" ? 0.5 : 1,
				background: away ? "var(--color-surface-control)" : elsewhere ? edge : color,
				color: away ? "var(--color-tertiary)" : elsewhere ? color : PRESENCE_INK,
				boxShadow: `0 0 0 2px ${edge}${elsewhere && !away ? `, inset 0 0 0 1.25px ${color}` : ""}`,
			}}
		>
			{name.charAt(0)}
			{followed && (
				<span className="absolute -inset-[4px] rounded-full border-[1.5px]" style={{ borderColor: color }} />
			)}
		</span>
	);
}

/**
 * Following someone: the canvas's edge in their colour, and how to stop. The words hang from the top right, where
 * nothing else stands, so a long path or a long name never runs into them; `centre` hangs them from the top's
 * middle, where the top right holds other things.
 */
export function FollowMark({ mate, centre = false }: { mate: Teammate; centre?: boolean }) {
	return (
		<div
			className="pointer-events-none absolute inset-0 z-30 animate-presence-in"
			data-presence-following={mate.person.accountId}
		>
			<span className="absolute inset-0 border-2" style={{ borderColor: mate.person.color }} />
			<span
				className={cn(
					"absolute top-0 max-w-[60%] truncate rounded-b-xs px-2 pt-[2px] pb-[3px] type-detail",
					centre ? "left-1/2 -translate-x-1/2" : "right-3",
				)}
				style={{ background: mate.person.color, color: PRESENCE_INK }}
			>
				following {mate.person.name} · esc
			</span>
		</div>
	);
}
