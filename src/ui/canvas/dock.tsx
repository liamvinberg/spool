import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../cn";
import { AgentIcon, PropertiesIcon } from "../icons";
import { useRemembered } from "../remembered";
import { AGENT_WIDTH } from "./agent-rail";
import {
	GRIP_CLASS,
	GRIP_HAIR,
	PROPERTIES_WIDTH,
	SNAP_BELOW,
	STRIP_WIDTH,
	useRailDrag,
	useRailWidth,
} from "./rail-width";

/**
 * The right column, and everything that can stand in it (#268).
 *
 * The column used to be a rail. `properties-rail.tsx` took it back for direct
 * manipulation (#256) and the agent rail stood beside it, shut, as a 44px strip
 * — so whichever surface you were not looking at *was* the button, and the
 * button moved: properties sat at the window's edge when it was open and one
 * strip in when it was not. Two rails cannot both be open (300 and 420 leave
 * 472px of field at 1440), so the shape was right and the control was wrong.
 *
 * The strip stops belonging to a rail and becomes the column's index. It is
 * 44px, it is always in the same place, and the glyphs in it are what the
 * column can hold: the lit one is what the panel shows, and pressing it again
 * shuts the column to the strip alone. Each surface keeps its own width, so the
 * column is 344, 464, or 44 — and a third surface later costs a glyph rather
 * than another rail.
 *
 * With one surface there is no index to draw, so the strip stands only where
 * the column is shut. That is #238 kept whole: an experiment that is off leaves
 * nothing behind, including a glyph, and a machine with no agent on it sees the
 * column it has always had.
 *
 * **The motion is the column's, never a rail's.** The edge travels 300ms on the
 * house curve, which is the number both rails already wore for width. The
 * surfaces cross in 120ms and are done before the edge is, so what reads is the
 * edge travelling rather than a card being dealt. Each surface is laid out at
 * the width it will settle at and the panel clips it, which is what keeps a
 * rail from re-laying on the way in: the alternative is watching the properties
 * rows squash through 120px to say a button was pressed. The pair is mounted
 * together only while they cross.
 */

export type DockSurface = "properties" | "agent";

/** how long a leaving surface stays mounted, which is the cross plus a frame */
const CROSS_MS = 160;

/**
 * What the column was left showing, as it is written down.
 *
 * `"shut"` rather than `null`, because a stored `null` and a key that was never
 * written are the same thing to `recall` — and a column somebody shut is a
 * layout they chose, which has to come back the way a dragged width does.
 */
type DockHeld = DockSurface | "shut";

const isHeld = (value: unknown): value is DockHeld => value === "shut" || value === "properties" || value === "agent";

export function Dock({
	agentOn,
	properties,
	agent,
	agentWorking,
}: {
	/** whether the agent is a surface on this machine at all (#238) */
	agentOn: boolean;
	/**
	 * Each surface, drawn at the width it will settle at and handed the one act
	 * it has over the column: its own carets shut the column rather than
	 * collapsing a rail, because a rail is not the thing with a shut state any
	 * more.
	 */
	properties: (width: number, shut: () => void) => ReactNode;
	agent: (width: number, shut: () => void) => ReactNode;
	/** a turn is in flight: the shut glyph says so, and says it landed once it has */
	agentWorking: boolean;
}) {
	const [kept, setKept] = useRemembered<DockHeld>("dock.open", "properties", isHeld);
	const open: DockSurface | null = kept === "shut" ? null : kept;
	const setOpen = (next: DockSurface | null) => setKept(next ?? "shut");
	const [propertiesWidth, setPropertiesWidth] = useRailWidth("properties", PROPERTIES_WIDTH);
	const [agentWidth, setAgentWidth] = useRailWidth("agent", AGENT_WIDTH);
	/** the surface on its way out, mounted only until the cross is over */
	const [leaving, setLeaving] = useState<DockSurface | null>(null);
	/** what the column was showing at the last render, which is what a change is against */
	const held = useRef(open);

	// the agent is not a surface here, so nothing may be left standing on it
	const shown = open === "agent" && !agentOn ? null : open;

	useEffect(() => {
		if (held.current === shown) return;
		const gone = held.current;
		held.current = shown;
		if (gone === null) return;
		setLeaving(gone);
		const timer = setTimeout(() => setLeaving(null), CROSS_MS);
		return () => clearTimeout(timer);
	}, [shown]);

	const widthOf = (surface: DockSurface) => (surface === "agent" ? agentWidth : propertiesWidth);
	const setWidthOf = (surface: DockSurface) => (surface === "agent" ? setAgentWidth : setPropertiesWidth);

	/**
	 * The width the hand is holding, which is not yet a width anybody keeps.
	 *
	 * The standing surface is laid out at it too, so a drag reflows the rail under
	 * the pointer the way it always has. Only the release is written down, and
	 * only the release can shut the column: the range's far end is the strip, and
	 * a hand passing through 44 on its way back out has not decided anything.
	 */
	const [live, setLive] = useState<number | null>(null);
	const settle = (next: number) => {
		setLive(null);
		if (shown === null) return;
		if (next <= STRIP_WIDTH) {
			setOpen(null);
			return;
		}
		setWidthOf(shown)(next);
	};
	const { dragging, grip } = useRailDrag(
		shown === null ? STRIP_WIDTH : widthOf(shown),
		setLive,
		shown === null ? PROPERTIES_WIDTH : widthOf(shown),
		settle,
	);
	/** what the standing surface is drawn at: the hand's number while there is one */
	const standing = shown === null ? 0 : dragging && live !== null ? live : widthOf(shown);
	const panel = shown === null ? 0 : standing;

	/**
	 * A turn that landed in a surface nobody was looking at.
	 *
	 * The dock knows both halves of that — whether a turn is running, and whether
	 * anybody can see it — so it is derived here rather than handed in. It is
	 * cleared by opening the agent, which is the only thing that answers it.
	 */
	const [unread, setUnread] = useState(false);
	const working = useRef(agentWorking);
	useEffect(() => {
		const was = working.current;
		working.current = agentWorking;
		if (was && !agentWorking && held.current !== "agent") setUnread(true);
		if (agentWorking && held.current === "agent") setUnread(false);
	}, [agentWorking]);
	useEffect(() => {
		if (shown === "agent") setUnread(false);
	}, [shown]);

	const surfaces: DockSurface[] = agentOn ? ["properties", "agent"] : ["properties"];
	// one surface has no index to draw: the strip is then that surface's own shut
	// state, which is the column spool has always had
	const strip = surfaces.length > 1 || shown === null;

	const shut = () => setOpen(null);
	const press = (surface: DockSurface) => () => {
		setOpen(shown === surface ? null : surface);
		// a drag that shut the column left a width behind; reopening honours it
		if (widthOf(surface) < SNAP_BELOW) setWidthOf(surface)(surface === "agent" ? AGENT_WIDTH : PROPERTIES_WIDTH);
	};

	return (
		<aside
			aria-label="Dock"
			data-dock=""
			className="relative z-20 flex h-full shrink-0"
			onPointerDown={(event) => event.stopPropagation()}
			onPointerMove={(event) => event.stopPropagation()}
			onDoubleClick={(event) => event.stopPropagation()}
			onContextMenu={(event) => {
				event.preventDefault();
				event.stopPropagation();
			}}
		>
			<div
				data-dock-panel=""
				style={{ width: panel }}
				className={cn(
					"relative h-full shrink-0 overflow-hidden",
					dragging
						? ""
						: "transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
				)}
			>
				{surfaces.map((surface) => {
					const up = shown === surface;
					if (!up && leaving !== surface) return null;
					return (
						<div
							key={surface}
							// the surface is placed against the strip and carries its own width, so
							// the panel's edge is the only thing that moves
							className={cn(
								"absolute inset-y-0 right-0 transition-opacity duration-[120ms] ease-out motion-reduce:transition-none",
								up ? "opacity-100" : "pointer-events-none opacity-0",
							)}
						>
							{surface === "agent"
								? agent(up ? standing : agentWidth, shut)
								: properties(up ? standing : propertiesWidth, shut)}
						</div>
					);
				})}
			</div>
			{shown === null ? null : (
				<button type="button" aria-label={`Resize ${shown}`} {...grip} className={GRIP_CLASS}>
					<span className={GRIP_HAIR} />
				</button>
			)}
			{strip ? (
				<div
					data-dock-strip=""
					className="flex h-full shrink-0 flex-col items-center gap-1 border-border border-l bg-bg pt-1.5"
					style={{ width: STRIP_WIDTH }}
				>
					<Glyph label="properties" lit={shown === "properties"} onPress={press("properties")}>
						<PropertiesIcon />
					</Glyph>
					{agentOn ? (
						<Glyph
							label="agent"
							lit={shown === "agent"}
							working={agentWorking}
							unread={unread}
							onPress={press("agent")}
						>
							<AgentIcon />
						</Glyph>
					) : null}
				</div>
			) : null}
		</aside>
	);
}

/**
 * One surface, as the index draws it.
 *
 * The press feel is the rails' own: colour in 140ms on the house curve, and the
 * glyph gives under the finger. A shut surface with something to say says it
 * here — a turning ring while a turn is in flight, and one dot after it lands
 * unread. The dot arrives the way the canvas's unseen mark does and then holds
 * still: a finished turn wants noticing on the next glance rather than dealing
 * with now, so nothing pulses.
 */
function Glyph({
	label,
	lit,
	working = false,
	unread = false,
	onPress,
	children,
}: {
	label: DockSurface;
	lit: boolean;
	working?: boolean;
	unread?: boolean;
	onPress: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			// a project may hold a page called `agent`, and the pages rail labels its
			// row's chevron "Expand agent" too — so the glyph carries a hook of its own
			data-dock-glyph={label}
			aria-label={`${lit ? "Shut" : "Expand"} ${label}`}
			aria-pressed={lit}
			onClick={onPress}
			className={cn(
				"relative flex h-8 w-8 items-center justify-center rounded-sm transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-90 motion-reduce:transition-none",
				lit ? "bg-raised text-text" : "text-muted/70 hover:text-text",
			)}
		>
			{children}
			{lit ? null : working ? (
				<svg
					viewBox="0 0 14 14"
					aria-hidden="true"
					fill="none"
					className="-right-1 absolute top-0 h-3 w-3 animate-agent-spin text-text/60"
				>
					<circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" strokeOpacity="0.26" />
					<path d="M7 2.4A4.6 4.6 0 0 1 11.6 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
				</svg>
			) : unread ? (
				<span
					aria-hidden="true"
					className="-right-0.5 absolute top-0.5 h-1.5 w-1.5 animate-unseen-in rounded-full bg-thread"
				/>
			) : null}
		</button>
	);
}
