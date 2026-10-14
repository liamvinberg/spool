import { useEffect, useReducer, useRef, useState } from "react";
import { ROOT_PAGE } from "../../page-path";
import { cn } from "../cn";
import { MenuItem, MenuSeparator } from "../primitives/overlays";
import { agentSays, idle, idleFor, nextChange, type PresenceRoom, type Teammate } from "./presence";

/**
 * Who's here, at the top right of a team canvas (DEV-196, task 139): one chip, standing on the canvas rather than
 * in the window's bar so switching tabs never moves the tabs. It holds a face for each teammate, four at most (three
 * and a `+N` past that), and is one button: pressed, it grows in place into the list of who's here and where each of
 * them is, or how long they've been idle. A row follows that person; pressing it again, or esc, stops.
 */

/** The faces drawn before the rest collapse into `+N`. */
const FACES_SHOWN = 4;
const SIZE = 22;
const STEP = 17;
/** How wide the chip opens into its list. */
const LIST_W = 248;
/** The chip's padding and edge, around its one button. */
const CHIP_EDGE = 4 * 2 + 2;

/** What the who's-here list says a page is called: its path, and `frames` for the root page, which is that folder. */
function pageLabel(page: string): string {
	return page === ROOT_PAGE ? "frames" : page;
}

/**
 * Draw again whenever anyone in the room changes, and whenever the clock alone changes what is said of them: a
 * name going quiet, someone going idle, and each minute an idle someone has been so.
 */
export function useRoomDrawn(room: PresenceRoom): void {
	const [, redraw] = useReducer((n: number) => n + 1, 0);
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const schedule = () => {
			if (timer !== undefined) clearTimeout(timer);
			const now = Date.now();
			const next = nextChange(room.teammates(), now);
			// the list says how long someone has been idle, so it counts the minutes too
			const minute = now + 60_000 - (now % 60_000);
			const at = next === undefined ? minute : Math.min(next, minute);
			timer = setTimeout(schedule, at - now + 5);
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

/** Working people first, then the idle, each in the order they arrived: the order the faces and the list take. */
function hereInOrder(mates: readonly Teammate[], now: number): Teammate[] {
	return [...mates.filter((mate) => !idle(mate, now)), ...mates.filter((mate) => idle(mate, now))];
}

/** The closed chip's width: its padding, the faces' run, the `+N`, the chevron. Every part is a fixed size. */
function chipWidth(here: number): number {
	const faces = here > FACES_SHOWN ? FACES_SHOWN - 1 : here;
	const more = here > FACES_SHOWN ? 5 + Math.max(26, String(here - faces).length * 7 + 12) : 0;
	return CHIP_EDGE + 8 + (faces - 1) * STEP + SIZE + more + 4 + 16 + 4;
}

export function PresenceFaces({
	room,
	page,
	following,
	onFollow,
}: {
	room: PresenceRoom;
	/** The page this canvas is on: someone elsewhere is drawn hollow. */
	page: string;
	following: string | null;
	onFollow: (accountId: string | null) => void;
}) {
	useRoomDrawn(room);
	const [open, setOpen] = useState(false);
	const chip = useRef<HTMLDivElement | null>(null);
	const button = useRef<HTMLButtonElement | null>(null);
	const now = Date.now();
	const here = hereInOrder(
		room.teammates().filter((mate) => mate.left === null),
		now,
	);
	const empty = here.length === 0;
	useEffect(() => {
		if (empty) setOpen(false);
	}, [empty]);
	useEffect(() => {
		if (!open) return;
		const close = (event: PointerEvent) => {
			if (!chip.current?.contains(event.target as Node)) setOpen(false);
		};
		const closeOnEsc = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			// the list goes first; following stops on the esc after
			event.stopImmediatePropagation();
			setOpen(false);
			if (chip.current?.contains(document.activeElement)) button.current?.focus();
		};
		window.addEventListener("pointerdown", close, true);
		window.addEventListener("keydown", closeOnEsc, true);
		return () => {
			window.removeEventListener("pointerdown", close, true);
			window.removeEventListener("keydown", closeOnEsc, true);
		};
	}, [open]);

	// the canvas under it never takes a press, a wheel or a menu meant for the chip, once the chip is drawn
	// biome-ignore lint/correctness/useExhaustiveDependencies: the chip comes and goes with whether anyone is here
	useEffect(() => {
		const element = chip.current;
		if (element === null) return;
		const keep = (event: Event) => event.stopPropagation();
		const kinds = ["pointerdown", "wheel", "contextmenu"] as const;
		for (const kind of kinds) element.addEventListener(kind, keep);
		return () => {
			for (const kind of kinds) element.removeEventListener(kind, keep);
		};
	}, [empty]);

	if (empty) return null;
	const shown = here.length > FACES_SHOWN ? here.slice(0, FACES_SHOWN - 1) : here;
	const more = here.length - shown.length;
	const closed = chipWidth(here.length);
	const follow = (mate: Teammate) => {
		setOpen(false);
		onFollow(following === mate.person.accountId ? null : mate.person.accountId);
	};

	return (
		<div ref={chip} className="relative h-[42px]" style={{ width: closed }} data-presence-faces="">
			<div
				data-presence-chip={open ? "open" : "closed"}
				className="absolute top-0 right-0 overflow-hidden rounded-lg border border-line-strong bg-surface-window p-1 transition-[width] duration-base ease-snap"
				style={{ width: open ? LIST_W : closed }}
			>
				<button
					ref={button}
					type="button"
					aria-label="Who is here"
					aria-expanded={open}
					aria-haspopup="menu"
					data-presence-open=""
					className={cn(
						"flex h-8 shrink-0 items-center rounded-md pr-1 pl-2 transition-colors duration-fast hover:bg-state-hover-raised",
						open ? "w-full" : "ml-auto",
					)}
					onClick={(event) => {
						const opening = !open;
						setOpen(opening);
						// opened from the keyboard, the keyboard goes on into the list
						if (opening && event.detail === 0)
							requestAnimationFrame(() =>
								chip.current?.querySelector<HTMLButtonElement>("[data-presence-row]")?.focus(),
							);
					}}
				>
					{open ? (
						<span
							data-presence-count=""
							className="mr-auto whitespace-nowrap text-secondary tabular-nums type-detail"
						>
							{here.length} here
						</span>
					) : (
						<>
							<span className="relative flex h-[30px] items-center">
								{shown.map((mate, i) => (
									<span
										key={mate.person.accountId}
										data-presence-face={mate.person.accountId}
										title={
											agentSays(mate) === null
												? mate.person.name
												: `${mate.person.name} · ${agentSays(mate)}`
										}
										className="relative h-[30px] shrink-0 animate-presence-in"
										style={{ width: i === shown.length - 1 ? SIZE : STEP, zIndex: shown.length - i }}
									>
										<Face
											mate={mate}
											away={mate.state.page !== page}
											resting={idle(mate, now)}
											followed={following === mate.person.accountId}
										/>
									</span>
								))}
							</span>
							{more > 0 && (
								<span className="ml-[5px] flex h-[22px] min-w-[26px] items-center justify-center rounded-full bg-surface-panel px-1 text-secondary tabular-nums type-detail">
									+{more}
								</span>
							)}
						</>
					)}
					<Chevron up={open} />
				</button>
				<div
					className="grid transition-[grid-template-rows,opacity] duration-base ease-snap"
					style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
				>
					<div
						role="menu"
						aria-label="Who is here"
						data-presence-list=""
						className="flex min-h-0 flex-col"
						inert={!open}
					>
						<MenuSeparator />
						{here.map((mate) => {
							const followed = following === mate.person.accountId;
							return (
								<MenuItem
									key={mate.person.accountId}
									data-presence-row={mate.person.accountId}
									title={`${followed ? "Stop following" : "Follow"} ${mate.person.name}`}
									icon={
										<span className="relative block size-4">
											<Face
												mate={mate}
												away={mate.state.page !== page}
												resting={idle(mate, now)}
												followed={false}
												size={16}
											/>
										</span>
									}
									label={<span className={cn(idle(mate, now) && "text-secondary")}>{mate.person.name}</span>}
									meta={
										<span
											className="block max-w-[110px] truncate"
											data-presence-row-says=""
											style={followed ? { color: mate.person.color } : undefined}
										>
											{followed
												? "following"
												: (agentSays(mate) ??
													(idle(mate, now) ? idleFor(mate, now) : pageLabel(mate.state.page)))}
										</span>
									}
									onClick={() => follow(mate)}
								/>
							);
						})}
						<MenuSeparator />
						<div className="flex h-row items-center gap-2 px-2 text-secondary">
							<span className="size-4 shrink-0 rounded-full border border-line-strong" />
							<span className="min-w-0 flex-1 type-control">You</span>
							<span className="block max-w-[110px] truncate type-detail" title={pageLabel(page)}>
								{pageLabel(page)}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function Chevron({ up }: { up: boolean }) {
	return (
		<svg
			viewBox="0 0 16 16"
			className={cn("ml-1 size-4 shrink-0 text-secondary transition-transform duration-fast", up && "rotate-180")}
			fill="none"
			aria-hidden="true"
		>
			<path
				d="m5 6.5 3 3 3-3"
				stroke="currentColor"
				strokeWidth="1.3"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

/** One person's face: filled in their colour where this canvas is, hollow elsewhere, faded while idle. */
export function Face({
	mate,
	away,
	resting,
	followed,
	size = SIZE,
}: {
	mate: Teammate;
	away: boolean;
	resting: boolean;
	followed: boolean;
	size?: number;
}) {
	const { color, name } = mate.person;
	return (
		<span
			className="absolute top-1/2 left-0 -translate-y-1/2 transition-[opacity,filter] duration-500"
			style={{
				width: size,
				height: size,
				opacity: resting ? 0.45 : 1,
				filter: resting ? "saturate(0.2)" : undefined,
			}}
		>
			<span
				className="absolute inset-0 flex items-center justify-center rounded-full font-semibold text-[10px] uppercase leading-none"
				style={{
					background: away ? "var(--color-surface-window)" : color,
					color: away ? color : "#0e0e0e",
					boxShadow: `0 0 0 2px var(--color-surface-window)${away ? `, inset 0 0 0 1.25px ${color}` : ""}`,
				}}
			>
				{name.charAt(0)}
			</span>
			{followed && (
				<span className="absolute -inset-[4px] rounded-full border-[1.5px]" style={{ borderColor: color }} />
			)}
		</span>
	);
}

/** The window's edge in the followed person's colour, and how to stop. */
export function FollowMark({ mate }: { mate: Teammate }) {
	return (
		<div className="pointer-events-none absolute inset-0 z-30" data-presence-following={mate.person.accountId}>
			<span className="absolute inset-0 border-2" style={{ borderColor: mate.person.color }} />
			<span
				className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-xs px-2 pt-[2px] pb-[3px] type-detail"
				style={{ background: mate.person.color, color: "#0e0e0e" }}
			>
				following {mate.person.name.toLowerCase()} · esc
			</span>
		</div>
	);
}
