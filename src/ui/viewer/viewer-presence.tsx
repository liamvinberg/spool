import { useCallback, useEffect, useRef, useState } from "react";
import type { PresenceState } from "../../team-sync-protocol";
import { createPresenceRoom, idle, type PresenceRoom, type Teammate } from "../canvas/presence";
import { Face, useRoomDrawn } from "../canvas/presence-faces";
import { joinPresence, type PresenceLink } from "./source";

/**
 * Who else is on a team project's canvas, for a member looking in a browser (DEV-197): the same people, drawn
 * the same way, as the Mac's canvas shows. `say` tells everyone else where this person is. An outsider's project
 * has no presence address, so they hear nobody and say nothing.
 */
export interface ViewerPresence {
	room: PresenceRoom;
	say: (state: PresenceState) => void;
}

export function useViewerPresence(address: string | undefined): ViewerPresence | null {
	const [room] = useState(() => createPresenceRoom());
	const link = useRef<PresenceLink | null>(null);
	useEffect(() => {
		if (address === undefined) return;
		const joined = joinPresence(address, { heard: (presence) => room.hear(presence), dropped: () => room.reset() });
		link.current = joined;
		return () => {
			link.current = null;
			joined.stop();
			room.reset();
		};
	}, [address, room]);
	const say = useCallback((state: PresenceState) => link.current?.say(state), []);
	return address === undefined ? null : { room, say };
}

/** The faces of whoever is in one part of the project, a few and then how many more: the phone's navigator's. */
export function PartFaces({ room, part }: { room: PresenceRoom; part: (mate: Teammate) => boolean }) {
	useRoomDrawn(room);
	const now = Date.now();
	const here = room.teammates().filter((mate) => mate.left === null && part(mate));
	if (here.length === 0) return null;
	const shown = here.length > PART_FACES ? here.slice(0, PART_FACES - 1) : here;
	return (
		<span
			className="flex shrink-0 items-center"
			data-presence-part={here.map((mate) => mate.person.name).join(" ")}
			title={here.length === 1 ? `${here[0]?.person.name} is here` : `${here.length} here`}
		>
			{shown.map((mate, i) => (
				<span
					key={mate.person.accountId}
					className="relative h-[18px] shrink-0"
					style={{ width: i === shown.length - 1 ? 18 : 13, zIndex: shown.length - i }}
				>
					<Face mate={mate} away={false} resting={idle(mate, now)} followed={false} size={18} />
				</span>
			))}
			{here.length > shown.length && (
				<span className="ml-1 text-muted tabular-nums type-detail">+{here.length - shown.length}</span>
			)}
		</span>
	);
}

/** The faces one part shows before the rest collapse into a count. */
const PART_FACES = 3;
