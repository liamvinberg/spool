import { type CSSProperties, useEffect, useMemo, useReducer, useSyncExternalStore } from "react";
import type { ProjectedPlaceholder } from "../../daemon/projection";
import type { PresenceAgentWork } from "../../team-sync-protocol";
import type { ProjectedFrame } from "../api";
import type { AgentCompanion, CompanionAct } from "./agent-companion";
import { AgentCompanionLayer } from "./agent-companion-layer";
import type { CameraStore } from "./camera-store";
import { PlaceholderFrame, type PlaceholderWork, workOf } from "./placeholder-frame";
import type { PresenceRoom, Teammate } from "./presence";

/**
 * Teammates' agents on a team canvas (#378).
 *
 * A placeholder frame a teammate's designer holds reaches this canvas through sync like any
 * frame file, with a record of whose agent made it. It is drawn in that person's presence
 * colour, as this canvas last heard of them, and in neutral ink for someone it has not.
 *
 * What their agent is doing rides their presence, said by their daemon while a turn runs:
 * a designer's step shows inside its placeholder, and an agent at a frame that stands is a
 * companion square on it, in their colour, as this canvas's own agent's is in ink.
 */

/** whose a placeholder is, when it is a teammate's: made by an account other than this canvas's own */
export function teammateOf(
	placeholder: ProjectedPlaceholder,
	you: string | null,
): { accountId: string; name: string } | undefined {
	const by = placeholder.by;
	if (by === undefined || you === null || by.accountId === you) return undefined;
	return by;
}

/** what a teammate's presence says their designer is doing in its placeholder; null for nothing */
export function workHeard(work: PresenceAgentWork | undefined): PlaceholderWork | null {
	if (work === undefined || (work.act !== "reading" && work.act !== "drawing")) return null;
	return workOf({
		key: work.frame,
		frame: work.frame,
		state: work.act,
		lines: work.lines,
		by: null,
		range: null,
		took: null,
		...(work.detail === null ? {} : { step: work.detail }),
	});
}

/** the acts a companion square knows; a word it doesn't is a square at rest */
const ACTS: readonly CompanionAct[] = ["new", "landed", "read", "edit", "shot", "delete", "ask", "idle"];

/** a word from a placeholder's vocabulary, said at a frame that stands, in a companion's */
function actOf(act: string): CompanionAct {
	if (act === "drawing") return "new";
	if (act === "reading") return "read";
	return ACTS.find((one) => one === act) ?? "idle";
}

/** a teammate's agents at the frames this canvas shows, as companion squares */
export function teammateCompanions(mate: Teammate, frames: ReadonlySet<string>): AgentCompanion[] {
	if (mate.left !== null) return [];
	return (mate.state.agent?.work ?? [])
		.filter((one) => frames.has(one.frame))
		.map((one) => {
			const act = actOf(one.act);
			return {
				key: `${mate.person.accountId}:${one.frame}`,
				name: null,
				frame: one.frame,
				spot: null,
				own: false,
				act,
				lines: one.lines,
				range: null,
				// presence says where they are now, not which event put them there: an act is its own beat
				beat: ACTS.indexOf(act),
			};
		});
}

/** a teammate's presence colour, as this canvas last heard it; null for someone it never has */
function useColor(room: PresenceRoom, accountId: string): string | null {
	return useSyncExternalStore(room.subscribe, () => room.person(accountId)?.color ?? null);
}

/** what a teammate's presence says their designer is doing in one placeholder */
function useWork(room: PresenceRoom, accountId: string, frame: string): PlaceholderWork | null {
	const said = useSyncExternalStore(room.subscribe, () => {
		const mate = room.get(accountId);
		const one = mate?.left === null ? mate.state.agent?.work.find((work) => work.frame === frame) : undefined;
		return one === undefined ? "" : JSON.stringify(one);
	});
	return useMemo(() => (said === "" ? null : workHeard(JSON.parse(said) as PresenceAgentWork)), [said]);
}

export function TeammatePlaceholder({
	room,
	placeholder,
	by,
	camera,
	pointed,
}: {
	room: PresenceRoom;
	placeholder: ProjectedPlaceholder;
	by: { accountId: string; name: string };
	camera: CameraStore;
	pointed: boolean;
}) {
	const color = useColor(room, by.accountId);
	const work = useWork(room, by.accountId, placeholder.name);
	const name = room.person(by.accountId)?.name ?? by.name;
	return (
		<PlaceholderFrame
			placeholder={placeholder}
			camera={camera}
			work={work}
			pointed={pointed}
			owner={{ accountId: by.accountId, name, color }}
		/>
	);
}

const NO_MARKS: never[] = [];

/** every teammate's agents at the frames on this page, each teammate's squares in their colour */
export function TeammateCompanions({
	room,
	camera,
	frames,
}: {
	room: PresenceRoom;
	camera: CameraStore;
	frames: readonly ProjectedFrame[];
}) {
	const [, redraw] = useReducer((n: number) => n + 1, 0);
	useEffect(() => room.subscribe(() => redraw()), [room]);
	const names = useMemo(() => new Set(frames.map((frame) => frame.name)), [frames]);
	return (
		<>
			{room.teammates().map((mate) => {
				const companions = teammateCompanions(mate, names);
				// kept while their turn runs, so a square that leaves a frame is seen to go
				if (companions.length === 0 && (mate.left !== null || mate.state.agent === undefined)) return null;
				return (
					<div
						key={mate.person.accountId}
						data-teammate-companions={mate.person.accountId}
						className="pointer-events-none absolute inset-0"
						// the squares are drawn in ink, and theirs is their colour
						style={{ "--color-text": mate.person.color } as CSSProperties}
					>
						<AgentCompanionLayer
							camera={camera}
							frames={frames}
							companions={companions}
							marks={NO_MARKS}
							footed={false}
						/>
					</div>
				);
			})}
		</>
	);
}
