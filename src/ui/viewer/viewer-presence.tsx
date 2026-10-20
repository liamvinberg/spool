import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type HeardComments, hearComments, NO_COMMENTS_HEARD } from "../../team-comments-heard";
import type { PresenceState } from "../../team-sync-protocol";
import { createPresenceRoom, idle, type PresenceRoom, type Teammate } from "../canvas/presence";
import { Face, useRoomDrawn } from "../canvas/presence-faces";
import { Count } from "../primitives/display";
import { joinPresence, type PresenceLink } from "./source";

/**
 * Who else is on a team project's canvas, for a member looking in a browser (DEV-197): the same people, drawn
 * the same way, as the Mac's canvas shows. `say` tells everyone else where this person is. An outsider's project
 * has no presence address, so they hear nobody and say nothing.
 *
 * The same socket brings the member's comments (spool#173), put together as a Mac's daemon puts them, and whether it
 * is connected, which is when a comment can be written. A connection that comes back is sent them all afresh.
 */
export interface ViewerPresence {
	room: PresenceRoom;
	say: (state: PresenceState) => void;
	comments: HeardComments;
	/** whether every comment has been heard since the socket last opened */
	heard: boolean;
	online: boolean;
}

export function useViewerPresence(address: string | undefined): ViewerPresence | null {
	const [room] = useState(() => createPresenceRoom());
	const [comments, setComments] = useState<HeardComments>(NO_COMMENTS_HEARD);
	const [online, setOnline] = useState(false);
	const [heard, setHeard] = useState(false);
	const link = useRef<PresenceLink | null>(null);
	useEffect(() => {
		if (address === undefined) return;
		const joined = joinPresence(address, {
			heard: (presence) => room.hear(presence),
			hidden: (hidden) => room.hide(hidden),
			dropped: () => {
				room.reset();
				setOnline(false);
			},
			opened: () => setOnline(true),
			comments: (message) => {
				setComments((held) => hearComments(held, message));
				if (message.type === "comments" && message.last) setHeard(true);
			},
		});
		link.current = joined;
		return () => {
			link.current = null;
			joined.stop();
			room.reset();
			setOnline(false);
		};
	}, [address, room]);
	const say = useCallback((state: PresenceState) => link.current?.say(state), []);
	return useMemo(
		() => (address === undefined ? null : { room, say, comments, heard, online }),
		[address, room, say, comments, heard, online],
	);
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
			{here.length > shown.length && <Count value={`+${here.length - shown.length}`} className="ml-1" />}
		</span>
	);
}

/** The faces one part shows before the rest collapse into a count. */
const PART_FACES = 3;
