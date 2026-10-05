import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ROOT_PAGE } from "../../page-path";
import { cn } from "../cn";
import { idle, idleFor, nextChange, type PresenceRoom, type Teammate } from "./presence";

/**
 * Who's here, at the top right of a team canvas (DEV-196): a face for each teammate on the project, a count
 * once there are more than fit, and the list a press on the count opens with where each of them is. Pressing
 * a face follows that person's view.
 */

/** The faces drawn before the rest collapse into a count. */
export const FACES_SHOWN = 4;
const SIZE = 22;
const STEP = 17;

/** What the who's-here list says a page is called: its path, and `frames` for the root page, which is that folder. */
export function pageLabel(page: string): string {
	return page === ROOT_PAGE ? "frames" : page;
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
	const [, redraw] = useReducer((n: number) => n + 1, 0);
	/** Where the open list hangs: under the faces, over the canvas and its rails, so not inside the header. */
	const [open, setOpen] = useState<{ top: number; right: number } | null>(null);
	const faces = useRef<HTMLDivElement | null>(null);
	const list = useRef<HTMLDivElement | null>(null);
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
	useEffect(() => {
		if (open === null) return;
		const close = (event: PointerEvent) => {
			const target = event.target as Node;
			if (!list.current?.contains(target) && !faces.current?.contains(target)) setOpen(null);
		};
		const closeOnEsc = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			event.stopImmediatePropagation();
			setOpen(null);
		};
		window.addEventListener("pointerdown", close, true);
		window.addEventListener("keydown", closeOnEsc, true);
		return () => {
			window.removeEventListener("pointerdown", close, true);
			window.removeEventListener("keydown", closeOnEsc, true);
		};
	}, [open]);

	const now = Date.now();
	const here = room.teammates().filter((mate) => mate.left === null);
	if (here.length === 0) return null;
	const shown = here.length > FACES_SHOWN ? here.slice(0, FACES_SHOWN - 1) : here;
	const more = here.length - shown.length;
	const follow = (mate: Teammate) => {
		setOpen(null);
		onFollow(following === mate.person.accountId ? null : mate.person.accountId);
	};

	return (
		<div ref={faces} className="relative flex h-full items-center" data-presence-faces="">
			<span className="mr-3 h-[18px] w-px bg-border-raised" />
			<span className="relative flex h-[30px] items-center">
				{shown.map((mate, i) => (
					<button
						key={mate.person.accountId}
						type="button"
						data-presence-face={mate.person.accountId}
						aria-label={`${following === mate.person.accountId ? "Stop following" : "Follow"} ${mate.person.name}`}
						aria-pressed={following === mate.person.accountId}
						title={mate.person.name}
						className="relative h-[30px] shrink-0 animate-presence-in"
						style={{ width: i === shown.length - 1 && more === 0 ? SIZE : STEP, zIndex: shown.length - i }}
						onClick={() => follow(mate)}
					>
						<Face
							mate={mate}
							away={mate.state.page !== page}
							resting={idle(mate, now)}
							followed={following === mate.person.accountId}
						/>
					</button>
				))}
				{more > 0 && (
					<span className="ml-[5px] flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-surface px-1 text-muted tabular-nums type-detail">
						+{more}
					</span>
				)}
			</span>
			<button
				type="button"
				aria-expanded={open !== null}
				aria-label="Who is here"
				data-presence-count=""
				className={cn(
					"ml-1 flex h-8 items-center rounded-sm px-1.5 text-muted tabular-nums transition-colors duration-[140ms] type-detail hover:bg-surface",
					open !== null && "bg-surface",
				)}
				onClick={(event) => {
					const at = event.currentTarget.getBoundingClientRect();
					setOpen((was) => (was === null ? { top: at.bottom + 4, right: window.innerWidth - at.right } : null));
				}}
			>
				{here.length}
			</button>
			{open !== null &&
				createPortal(
					<div
						ref={list}
						data-presence-list=""
						className="fixed z-50 flex w-[264px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit"
						style={open}
					>
						{here.map((mate) => (
							<button
								key={mate.person.accountId}
								type="button"
								data-presence-row={mate.person.accountId}
								className="flex h-[30px] items-center gap-2.5 rounded-sm px-2.5 text-left hover:bg-border-raised/60"
								onClick={() => follow(mate)}
							>
								<span className="relative h-[18px] w-[18px] shrink-0">
									<Face
										mate={mate}
										away={mate.state.page !== page}
										resting={idle(mate, now)}
										followed={false}
										size={18}
									/>
								</span>
								<span
									className={cn(
										"min-w-0 flex-1 truncate type-control",
										idle(mate, now) ? "text-muted" : "text-text",
									)}
								>
									{mate.person.name}
								</span>
								<span className="text-muted type-detail">
									{idle(mate, now) ? idleFor(mate, now) : pageLabel(mate.state.page)}
								</span>
							</button>
						))}
						<div className="mx-auto my-1 h-px w-[240px] bg-border-raised" />
						<div className="flex h-[30px] items-center gap-2.5 rounded-sm px-2.5 text-muted">
							<span className="h-[18px] w-[18px] shrink-0 rounded-full border border-border-raised" />
							<span className="min-w-0 flex-1 type-control">You</span>
							<span className="type-detail">{pageLabel(page)}</span>
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}

function Face({
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
					background: away ? "var(--color-bg)" : color,
					color: away ? color : "#0e0e0e",
					boxShadow: `0 0 0 2px var(--color-bg)${away ? `, inset 0 0 0 1.25px ${color}` : ""}`,
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
